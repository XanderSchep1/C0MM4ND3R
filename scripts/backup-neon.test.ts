import { describe, expect, it, vi } from "vitest";
import { BACKUP_PREFIX, RETENTION_DAYS, backupName, createBackup, expiryFor } from "./backup-neon.mjs";

const now = new Date("2026-10-07T03:17:42.123Z");

// A tiny stand-in for Neon's API: lists the given branches and records what is created.
function fakeNeon(branches: { id: string; name: string }[], createResponse?: unknown, createStatus = 201) {
  const calls: { method: string; path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.replace("https://console.neon.tech/api/v2", "");
    calls.push({ method: init.method ?? "GET", path, body: init.body ? JSON.parse(String(init.body)) : undefined });
    if (!init.method || init.method === "GET") return new Response(JSON.stringify({ branches }), { status: 200 });
    return new Response(JSON.stringify(createResponse ?? { branch: { id: "br-new", expires_at: expiryFor(now) } }), { status: createStatus });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls };
}

const production = { id: "br-prod", name: "production" };
const options = { apiKey: "key", projectId: "proj-1", now };

describe("backupName / expiryFor", () => {
  it("names backups by UTC date and time", () => {
    expect(backupName(now)).toBe("backup-2026-10-07T0317Z");
    expect(backupName(now).startsWith(BACKUP_PREFIX)).toBe(true);
  });

  it("expires backups after the retention window", () => {
    expect(RETENTION_DAYS).toBeLessThanOrEqual(7); // 7 backups + production + dev must fit in 10 branches
    expect(expiryFor(now)).toBe("2026-10-13T03:17:42.123Z");
  });
});

describe("createBackup", () => {
  it("branches from production with an expiry and no compute", async () => {
    const { fetchImpl, calls } = fakeNeon([production, { id: "br-dev", name: "dev" }]);
    const result = await createBackup({ ...options, fetchImpl });
    expect(result).toMatchObject({ name: "backup-2026-10-07T0317Z", id: "br-new", source: "production" });
    const create = calls.find((c) => c.method === "POST")!;
    expect(create.path).toBe("/projects/proj-1/branches");
    expect(create.body).toEqual({ branch: { name: "backup-2026-10-07T0317Z", parent_id: "br-prod", expires_at: "2026-10-13T03:17:42.123Z" } });
    expect(JSON.stringify(create.body)).not.toContain("endpoints");
  });

  it("sends the API key as a bearer token and nowhere else", async () => {
    const { fetchImpl } = fakeNeon([production]);
    await createBackup({ ...options, apiKey: "secret-key", fetchImpl });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).not.toContain("secret-key");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer secret-key" });
  });

  it("never deletes anything", async () => {
    const { fetchImpl, calls } = fakeNeon([production, { id: "br-old", name: "backup-2026-09-01T0317Z" }]);
    await createBackup({ ...options, fetchImpl });
    expect(calls.map((c) => c.method).sort()).toEqual(["GET", "POST"]);
  });

  it("does nothing if tonight's backup already exists", async () => {
    const { fetchImpl, calls } = fakeNeon([production, { id: "br-x", name: "backup-2026-10-07T0317Z" }]);
    expect(await createBackup({ ...options, fetchImpl })).toMatchObject({ skipped: true });
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("fails loudly when production can't be found", async () => {
    const { fetchImpl } = fakeNeon([{ id: "br-dev", name: "dev" }]);
    await expect(createBackup({ ...options, fetchImpl })).rejects.toThrow(/No branch named "production"/);
  });

  it("fails when the key or project is missing", async () => {
    const { fetchImpl } = fakeNeon([production]);
    await expect(createBackup({ ...options, apiKey: "", fetchImpl })).rejects.toThrow(/NEON_API_KEY/);
    await expect(createBackup({ ...options, projectId: "", fetchImpl })).rejects.toThrow(/NEON_PROJECT_ID/);
  });

  it("surfaces Neon's error message, such as the branch limit", async () => {
    const { fetchImpl } = fakeNeon([production], { message: "branches limit exceeded" }, 422);
    await expect(createBackup({ ...options, fetchImpl })).rejects.toThrow(/422 branches limit exceeded/);
  });

  it("refuses to call a backup done if Neon did not set an expiry", async () => {
    const { fetchImpl } = fakeNeon([production], { branch: { id: "br-new" } });
    await expect(createBackup({ ...options, fetchImpl })).rejects.toThrow(/did not set an expiry/);
  });
});
