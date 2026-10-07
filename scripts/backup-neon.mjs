#!/usr/bin/env node
// Daily database backup: makes a copy-on-write branch of the production database
// inside the same Neon project, named backup-<timestamp>, with an expiry date so
// Neon removes it by itself. It never deletes anything and never opens a database
// connection, so it can't touch your data — it only asks Neon for a new branch.
//
//   NEON_API_KEY=... NEON_PROJECT_ID=... node scripts/backup-neon.mjs
//
// Run by .github/workflows/backup.yml every night. To restore, see README.md.
import { pathToFileURL } from "node:url";

const API = "https://console.neon.tech/api/v2";

// 6 daily backups plus production and dev stays inside the free plan's 10 branches.
export const RETENTION_DAYS = 6;
export const BACKUP_PREFIX = "backup-";

// backup-2026-10-07T0317Z — sorts by time, and is a valid branch name.
export function backupName(now) {
  const iso = now.toISOString(); // 2026-10-07T03:17:42.123Z
  return `${BACKUP_PREFIX}${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}

export function expiryFor(now, days = RETENTION_DAYS) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function neon(fetchImpl, apiKey, path, init = {}) {
  const res = await fetchImpl(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json", "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // leave body null; the status line below is what matters
  }
  if (!res.ok) {
    throw new Error(`Neon API ${init.method ?? "GET"} ${path} failed: ${res.status} ${body?.message ?? text.slice(0, 200)}`);
  }
  return body;
}

export async function createBackup({ apiKey, projectId, sourceName = "production", now = new Date(), fetchImpl = fetch }) {
  if (!apiKey) throw new Error("NEON_API_KEY is not set (add it as a GitHub Actions secret).");
  if (!projectId) throw new Error("NEON_PROJECT_ID is not set.");

  const project = encodeURIComponent(projectId);
  const { branches } = await neon(fetchImpl, apiKey, `/projects/${project}/branches`);
  const source = branches.find((b) => b.name === sourceName);
  if (!source) throw new Error(`No branch named "${sourceName}" in project ${projectId}.`);

  const name = backupName(now);
  if (branches.some((b) => b.name === name)) return { name, skipped: true };

  // No endpoints in the request, so the backup has no compute and costs no compute hours.
  const created = await neon(fetchImpl, apiKey, `/projects/${project}/branches`, {
    method: "POST",
    body: JSON.stringify({ branch: { name, parent_id: source.id, expires_at: expiryFor(now) } }),
  });

  // A backup that never expires would pile up until the branch limit is hit, so refuse to call it done.
  if (!created?.branch?.expires_at) throw new Error(`Created ${name} but Neon did not set an expiry on it — delete it and check the plan.`);
  return { name, id: created.branch.id, expiresAt: created.branch.expires_at, source: source.name };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await createBackup({ apiKey: process.env.NEON_API_KEY, projectId: process.env.NEON_PROJECT_ID, sourceName: process.env.NEON_BACKUP_SOURCE || "production" });
    if (result.skipped) console.log(`${result.name} already exists — nothing to do.`);
    else console.log(`Created ${result.name} from ${result.source} (expires ${result.expiresAt}).`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
