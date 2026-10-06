#!/usr/bin/env node
// Manual password reset for when someone is locked out and has no recovery code.
//
//   DATABASE_URL="<production url>" node scripts/reset-password.mjs friend@example.com
//
// Sets a random temporary password, prints it, and clears nothing else. Tell
// the person to sign in and change it on the Account page (and generate a new
// recovery code there). Self-contained on purpose: it only needs `pg`.
import { randomBytes, randomInt, scrypt } from "node:crypto";
import pg from "pg";

const email = (process.argv[2] ?? "").trim().toLowerCase();
if (!email || !process.env.DATABASE_URL) {
  console.error('Usage: DATABASE_URL="postgresql://..." node scripts/reset-password.mjs <email>');
  process.exit(1);
}

const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
const temp = Array.from({ length: 14 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");

// Must match src/lib/password.ts: "<salt hex>:<scrypt(password, salt, 64) hex>".
const salt = randomBytes(16);
const key = await new Promise((resolve, reject) => scrypt(temp, salt, 64, (err, k) => (err ? reject(err) : resolve(k))));
const hash = `${salt.toString("hex")}:${key.toString("hex")}`;

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const host = new URL(process.env.DATABASE_URL).hostname;
const res = await client.query(`UPDATE "User" SET "passwordHash" = $1 WHERE lower("email") = $2 RETURNING "email"`, [hash, email]);
await client.end();

if (res.rowCount === 0) {
  console.error(`No account found for ${email} on ${host}.`);
  process.exit(1);
}
console.log(`Password reset for ${res.rows[0].email} on ${host}.`);
console.log(`Temporary password: ${temp}`);
