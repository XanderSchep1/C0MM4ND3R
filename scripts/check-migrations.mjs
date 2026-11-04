#!/usr/bin/env node
// Deploy gate: stops a production build when the code ships database migrations the production
// database doesn't have yet. Without it, the new code goes live against the old tables and every page
// that touches them errors until someone runs the migration. With it, the build fails, the previous
// deployment keeps serving, and the log says exactly what to run.
//
// It only reads: it lists the migrations in prisma/migrations and compares them with the ones Prisma
// recorded in the database's _prisma_migrations table. It runs from `npm run build` and does nothing
// unless this is a Vercel production build (or CHECK_MIGRATIONS=1). If the check itself can't run (no
// URL, database unreachable) it warns and lets the build continue: a flaky check must not block deploys.
import { readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";

const MIGRATIONS_DIR = new URL("../prisma/migrations/", import.meta.url);

// Migration folders are named <14-digit timestamp>_<name>; migration_lock.toml is not one.
export function migrationsOnDisk(dir = MIGRATIONS_DIR) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^\d{14}_/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function pendingMigrations(onDisk, applied) {
  const done = new Set(applied);
  return onDisk.filter((name) => !done.has(name));
}

async function appliedMigrations(connectionString) {
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 15000 });
  await client.connect();
  try {
    const table = await client.query(`SELECT to_regclass('_prisma_migrations') AS t`);
    if (!table.rows[0].t) return [];
    const rows = await client.query(`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`);
    return rows.rows.map((row) => row.migration_name);
  } finally {
    await client.end().catch(() => {});
  }
}

/**
 * Returns the process exit code. Everything it touches is injectable so it can be tested.
 * @param {{
 *   env?: Record<string, string | undefined>;
 *   onDisk?: () => string[];
 *   applied?: (connectionString: string) => Promise<string[]>;
 *   log?: { log: (message: string) => void; warn: (message: string) => void; error: (message: string) => void };
 * }} [options]
 * @returns {Promise<number>}
 */
export async function checkMigrations({ env = process.env, onDisk = migrationsOnDisk, applied = appliedMigrations, log = console } = {}) {
  if (env.VERCEL_ENV !== "production" && env.CHECK_MIGRATIONS !== "1") return 0;
  if (!env.DATABASE_URL) {
    log.warn("check-migrations: no DATABASE_URL, so the database wasn't compared with the code. Continuing.");
    return 0;
  }

  let pending;
  try {
    pending = pendingMigrations(onDisk(), await applied(env.DATABASE_URL));
  } catch (err) {
    log.warn(`check-migrations: couldn't read the database (${err instanceof Error ? err.message : err}). Continuing without the check.`);
    return 0;
  }

  if (pending.length === 0) {
    log.log("check-migrations: the database has every migration in this build.");
    return 0;
  }
  log.error(
    [
      "",
      "check-migrations: the production database is behind this code, so this deploy was stopped.",
      "The site keeps running on the previous deployment. Migrations not applied yet:",
      ...pending.map((name) => `  - ${name}`),
      "",
      "Apply them to the production database, then redeploy (Vercel > Deployments > ... > Redeploy):",
      "  (set -a; . ./.env; set +a; npx prisma migrate deploy)",
      "",
    ].join("\n")
  );
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await checkMigrations();
}
