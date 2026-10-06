import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Prefer the local Neon dev-branch URL so `prisma migrate dev` never touches
// production. dotenv never overrides variables that are already set, so a
// DATABASE_URL passed on the command line (e.g. for `migrate deploy` against
// production) still wins.
if (process.env.NODE_ENV !== "production") config({ path: ".env.development.local", quiet: true });
config({ quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
