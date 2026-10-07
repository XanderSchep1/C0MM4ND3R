#!/usr/bin/env node
// Deletes one account and everything it owns (decks, cards, collection, sessions).
//
//   DATABASE_URL="<production url>" node scripts/delete-user.mjs old@example.com          # preview only
//   DATABASE_URL="<production url>" node scripts/delete-user.mjs old@example.com --yes    # really delete
//
// Safety rails: it shows the account first and changes nothing without --yes, and it
// refuses accounts that have a password (a real person's account) unless you also pass
// --even-with-password. Self-contained on purpose: it only needs `pg`.
import pg from "pg";

const args = process.argv.slice(2);
const email = (args.find((a) => !a.startsWith("--")) ?? "").trim().toLowerCase();
const confirmed = args.includes("--yes");
const allowPassword = args.includes("--even-with-password");

if (!email || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/delete-user.mjs <email> [--yes] [--even-with-password]');
  process.exit(1);
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const host = new URL(process.env.DATABASE_URL).hostname;

try {
  const found = await client.query(
    `SELECT id, email, name, ("passwordHash" IS NOT NULL) AS "hasPassword" FROM "User" WHERE lower(email) = $1`,
    [email]
  );
  if (found.rowCount === 0) {
    console.error(`No account found for ${email} on ${host}.`);
    process.exit(1);
  }
  const user = found.rows[0];

  const decks = await client.query(
    `SELECT d.name, (SELECT COUNT(*)::int FROM "DeckCard" dc WHERE dc."deckId" = d.id) AS cards FROM "Deck" d WHERE d."userId" = $1 ORDER BY d.name`,
    [user.id]
  );
  const owned = await client.query(`SELECT COUNT(*)::int AS n FROM "OwnedCard" WHERE "userId" = $1`, [user.id]);

  console.log(`Database:  ${host}`);
  console.log(`Account:   ${user.email}${user.name ? ` (${user.name})` : ""}`);
  console.log(`Password:  ${user.hasPassword ? "YES — this looks like a real account" : "none (cannot sign in)"}`);
  console.log(`Decks:     ${decks.rowCount}${decks.rows.map((d) => `\n           - ${d.name} (${d.cards} cards)`).join("")}`);
  console.log(`Collection: ${owned.rows[0].n} owned-card rows`);

  if (user.hasPassword && !allowPassword) {
    console.error("\nRefusing: this account has a password. Pass --even-with-password if you really mean it.");
    process.exit(1);
  }
  if (!confirmed) {
    console.log("\nPreview only — nothing was deleted. Re-run with --yes to delete this account and everything above.");
    process.exit(0);
  }

  // Decks, cards, owned cards and sessions all cascade from the user row.
  const deleted = await client.query(`DELETE FROM "User" WHERE id = $1`, [user.id]);
  console.log(`\nDeleted ${user.email} (${deleted.rowCount} account row; its decks, cards and collection went with it).`);
} finally {
  await client.end();
}
