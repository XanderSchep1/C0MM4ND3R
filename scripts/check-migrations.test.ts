import { describe, expect, it, vi } from "vitest";
import { checkMigrations, migrationsOnDisk, pendingMigrations } from "./check-migrations.mjs";

const onDisk = () => ["20261006000000_init", "20261007124705_add_deck_card_mark", "20261008090000_add_friends_and_collaborators"];
const quietLog = () => ({ log: vi.fn(), warn: vi.fn(), error: vi.fn() });
const production = { VERCEL_ENV: "production", DATABASE_URL: "postgresql://x" };

describe("pendingMigrations", () => {
  it("lists the migrations on disk that the database hasn't recorded, in order", () => {
    expect(pendingMigrations(onDisk(), ["20261006000000_init"])).toEqual(["20261007124705_add_deck_card_mark", "20261008090000_add_friends_and_collaborators"]);
  });

  it("is empty when every migration is applied (extra recorded ones are fine)", () => {
    expect(pendingMigrations(onDisk(), [...onDisk(), "20260101000000_old"])).toEqual([]);
  });
});

describe("migrationsOnDisk", () => {
  it("finds the real migration folders and ignores migration_lock.toml", () => {
    const names = migrationsOnDisk();
    expect(names.length).toBeGreaterThan(0);
    expect(names.every((n) => /^\d{14}_/.test(n))).toBe(true);
    expect(names).toEqual([...names].sort());
  });
});

describe("checkMigrations", () => {
  it("does nothing outside a production build, and never touches the database", async () => {
    const applied = vi.fn();
    expect(await checkMigrations({ env: { DATABASE_URL: "postgresql://x" }, onDisk, applied, log: quietLog() })).toBe(0);
    expect(await checkMigrations({ env: { VERCEL_ENV: "preview", DATABASE_URL: "postgresql://x" }, onDisk, applied, log: quietLog() })).toBe(0);
    expect(applied).not.toHaveBeenCalled();
  });

  it("can be forced with CHECK_MIGRATIONS=1", async () => {
    const applied = vi.fn(async () => ["20261006000000_init"]);
    expect(await checkMigrations({ env: { CHECK_MIGRATIONS: "1", DATABASE_URL: "postgresql://x" }, onDisk, applied, log: quietLog() })).toBe(1);
  });

  it("passes when the database has everything", async () => {
    const log = quietLog();
    expect(await checkMigrations({ env: production, onDisk, applied: async () => onDisk(), log })).toBe(0);
    expect(log.error).not.toHaveBeenCalled();
  });

  it("fails the build when a migration is missing, naming it and the command to run", async () => {
    const log = quietLog();
    const code = await checkMigrations({ env: production, onDisk, applied: async () => ["20261006000000_init", "20261007124705_add_deck_card_mark"], log });
    expect(code).toBe(1);
    const message = String(log.error.mock.calls[0][0]);
    expect(message).toContain("20261008090000_add_friends_and_collaborators");
    expect(message).not.toContain("20261007124705");
    expect(message).toContain("prisma migrate deploy");
  });

  it("treats a database with no migration history as fully behind", async () => {
    expect(await checkMigrations({ env: production, onDisk, applied: async () => [], log: quietLog() })).toBe(1);
  });

  it("warns and lets the build continue if the database can't be read", async () => {
    const log = quietLog();
    const applied = async () => {
      throw new Error("connect ETIMEDOUT");
    };
    expect(await checkMigrations({ env: production, onDisk, applied, log })).toBe(0);
    expect(log.warn.mock.calls[0][0]).toContain("ETIMEDOUT");
  });

  it("warns and continues when there is no DATABASE_URL", async () => {
    const log = quietLog();
    expect(await checkMigrations({ env: { VERCEL_ENV: "production" }, onDisk, applied: async () => [], log })).toBe(0);
    expect(log.warn).toHaveBeenCalled();
  });
});
