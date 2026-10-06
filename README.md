# C0MM4ND3R

A Commander (EDH) deckbuilder: search live [Scryfall](https://scryfall.com) card data, import a decklist, track
legality (100 cards, singleton, color identity, banned list), and get suggestions that fill the actual gaps in your
deck (ramp, removal, draw, board wipes, tutors, recursion, counterspells) sorted by real Commander popularity via
Scryfall's `order=edhrec`.

Also: a combo finder backed by [Commander Spellbook](https://commanderspellbook.com) (shows combos you can already
pull off, and combos you're one or two cards from completing), a price total and rough power-level estimate from
Scryfall's own Game Changers list, decklist export, one-click basic land fill, and a heuristic "annoyance" flag
(mass land destruction, stax, extra turns, hard counters, Game Changers) with same-function swap suggestions — not
EDHREC's actual Salt Score, which isn't available via any public API.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind v4, manual light/dark theme toggle (class-based, persisted to
  `localStorage`, no flash-of-wrong-theme)
- Postgres + Prisma 7 (`@prisma/adapter-pg`)
- Auth.js (NextAuth v5) — email + password accounts created in the app itself (passwords stored as salted scrypt
  hashes, JWT sessions), plus a dev-only "sign in as any email" provider for accounts that predate passwords (only
  registered when `NODE_ENV !== "production"`)
- Scryfall REST API, proxied through server routes with in-process rate limiting (their documented limits: 2 req/s
  for `/cards/search`, `/cards/named`, `/cards/collection`; 10 req/s everything else) and a Postgres-backed cache
  (`CardCache`) so repeat views don't re-hit Scryfall
- Commander Spellbook's public API (`backend.commanderspellbook.com`) for combo data, queried in batches by the
  deck's own card names (mirroring how their own "Find My Combos" feature works) rather than bulk-fetched

## Local setup

1. **Install deps**

   ```bash
   npm install
   ```

2. **Database.** Create a free Postgres instance — [Neon](https://neon.tech), [Vercel Postgres](https://vercel.com/storage/postgres),
   or Supabase all work. Copy the connection string.

3. **Env vars.** Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — from step 2
   - `AUTH_SECRET` — generate with `openssl rand -base64 33`

4. **Run migrations**

   ```bash
   npx prisma migrate dev
   ```

5. **Start the dev server**

   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000`, click **Sign in**, then **Create account** with an email and password.

## Dev database vs. production

`next dev` and the Prisma CLI use a Neon **dev branch** (a copy-on-write copy of production) whose URL lives in
the git-ignored `.env.development.local`. `.env` still holds the production URL, which builds and Vercel use. To
apply migrations to production, pass its URL explicitly (an explicit variable always wins):

```bash
DATABASE_URL="<production url>" npx prisma migrate deploy
```

Refresh the dev branch from production any time with
`neon branch reset dev --parent --project-id <id> --config-dir ~/.neonctl`.

## Password reset and account recovery

Sign-up shows each person a one-time **recovery code**; "Forgot your password?" on the sign-in page uses it to set a new
password. If someone loses their password *and* their code, reset them by hand against the production database:

```bash
DATABASE_URL="<production url>" node scripts/reset-password.mjs friend@example.com
```

It prints a random temporary password to pass on; they can change it (and generate a new recovery code) on the Account page.

## Working safely

Every push to `main` deploys to production, and CI (`.github/workflows/ci.yml`) typechecks, lints and builds each push and pull
request. Work on a branch, open a pull request, and merge when CI is green. In GitHub, Settings → Branches → add a rule for
`main` that requires the **check** job to pass if you want that enforced.

## Deploying to Vercel

1. Push this repo to GitHub and import it in Vercel, **or** run `vercel` from this directory.
2. Add a Postgres integration (Vercel Postgres, or connect an external Neon/Supabase database) — this sets
   `DATABASE_URL` automatically, or set it yourself under Project Settings → Environment Variables.
   In production use Neon's **pooled** connection string (the host contains `-pooler`) for `DATABASE_URL`, and keep
   the direct string for running migrations. `DATABASE_POOL_MAX` (default 5) caps connections per server instance.
3. Add `AUTH_SECRET` as an environment variable.
4. Run `npx prisma migrate deploy` against the production database (e.g. `vercel env pull .env.production.local`
   then `DATABASE_URL=... npx prisma migrate deploy`), or wire it into your deploy pipeline.
5. Deploy. The dev-only credentials login is automatically excluded since `NODE_ENV === "production"` on Vercel.

Once the GitHub repo is connected to the Vercel project (Project Settings → Git), every push to `main` deploys to
production automatically. `vercel deploy --prod` still works for a manual deploy.

## How the suggestion engine works

`src/lib/deck-analysis.ts` classifies the cards already in your deck locally (regex over cached Oracle text — no
API calls) into themes (ramp, draw, removal, board wipes, tutors, recursion, counterspells) and compares counts
against Commander rule-of-thumb targets. For any theme that's short, `src/lib/suggestions.ts` queries Scryfall's
[Tagger `function:` oracle tags](https://scryfall.com/docs/syntax#tagger-tags) (e.g. `function:ramp`) scoped to your
commander's color identity, sorted by `order:edhrec`, so suggestions are both legal and genuinely popular — no
scraping, just Scryfall's own documented search API.

## Project structure

- `src/lib/scryfall.ts` — rate-limited Scryfall API client
- `src/lib/cards.ts` — Postgres-backed cache layer on top of Scryfall
- `src/lib/commander.ts` — Commander legality validation (singleton, 100 cards, color identity, banned list)
- `src/lib/decklist-parser.ts` / `src/lib/decklist-export.ts` — import/export of pasted decklists
- `src/lib/deck-analysis.ts` / `src/lib/suggestions.ts` — the suggestion engine, plus power-level and price total
- `src/lib/combos.ts` — Commander Spellbook client + combo-opportunity matching
- `src/lib/annoyance.ts` — the heuristic annoyance/"salt" classifier
- `src/lib/land-fill.ts` — basic land auto-fill ratio calculation
- `src/app/decks/[id]` — the deck builder page and its API routes
