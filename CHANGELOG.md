# Changelog

## 2026-10-07

### Fixed
- **A card you search for by name is never hidden by the Budget filter.** With "Up to $5 per card" on, searching the full name of a $5.19 card (e.g. Rhythm of the Wild) used to show nothing, which looked like the search had failed. A card whose full name you typed now always shows, and Enter adds exactly that card.
- **The Budget filter now says when it hides results.** Search and Keyword show "N results are over your $5 budget and hidden" with a **Show them** button, instead of silently showing fewer cards or none.
- **Search results squashed to just their art.** In some browsers (Safari) the card grid under Search and Keyword shrank every row to make the whole grid fit its height limit, so each card was cut off and its price and **Add** / **Maybe** buttons were hidden. Rows now keep the height of their cards, and the card no longer clips its own box.

### New
- **Sort the deck list.** A **Sort** menu above the Mainboard orders both the Mainboard and the Maybeboard by **Card type** (the usual groups), **Mana value** (1, 2, 3 … 7+ mana, lands last), **Name**, **Price**, **Color** (white, blue, black, red, green, multicolor, colorless, lands), **Highlight** (owned, missing, not highlighted) or **Popularity** (most played in Commander first). The arrow button reverses any sort. Cards with no price or no popularity ranking always sit at the end. Your choice is remembered in this browser.
- **"Then by": a second sort inside each group.** Under Sort there is now a **Then by** menu with its own arrow. It orders the cards inside each heading, so *Card type, then Mana value* lists every creature cheapest-first, then every sorcery cheapest-first, and so on; *Mana value, then Price* puts the dearest 1-drop first; *Color, then Card type* groups each color by type. For Name, Price and Popularity (one long list) it settles ties. The second sort can't be the same as the first, and is hidden for Name, where every card is already in a fixed place. Reversing the main sort now flips only the headings, so the order inside them stays as you set it.
- **Suggestions are now a flippable book.** Every gap in your deck (ramp, removal, card draw, tutors, recursion, lands…) is a chapter with up to **40 popular cards** instead of 8, shown six to a page. Pick a chapter from the bookmarks along the top, then turn the pages with the **Previous / Next** buttons, the **← →** keys, or a swipe, and watch the page swing over. Adding a card takes it out of every chapter and the pages close up behind it. The Budget filter works here too and says how many cards it is hiding.
- **New "Upgrades" tab: cheaper or pricier replacements for the cards you have.** It checks every non-basic card in your deck, works out its job (ramp, removal, draw, lands…), and finds popular cards of the same kind and similar mana cost that are **cheaper** (budget swaps, saving at least $1) or **pricier** and more played (upgrades). Each card gets up to three options with the price difference and a **Swap** button (with Undo). Nothing is looked up until you press **Find cheaper replacements** or **Find pricier upgrades**.
- **The old Upgrades tab is now "New cards".** It still checks recently released sets for cards that would improve your deck, and keeps its blue dot when there are new sets to look at.
- **Instant edits.** Adding, removing, changing a quantity, moving a card, highlighting and sharing now show on screen immediately, and the deck's stats (card count, price, power level, issues, colour balance) update at the same moment instead of after a reload. The change is saved in the background, in order; if the server rejects it, the screen puts things back and says why.
- **Undo.** Removing a card (or dropping its quantity to zero), moving it between Mainboard and Maybeboard, and swapping in an upgrade each show a toast with **Undo**.
- **Keyboard quick-add.** Press **/** anywhere on a deck to jump to card search. **Enter** adds the highlighted result to the Mainboard, **Shift+Enter** adds it to the Maybeboard, and **↑ / ↓** choose another result; pressing Enter before the results have loaded adds the first match as soon as they arrive. The search box stays open with its text selected, so you can type the next card straight away, and a "✓ Added" note confirms each one.
- **Calmer card lines.** Each line is now a highlight button, − , + and a **⋯** menu (Move to Maybeboard / Mainboard, Remove from deck) instead of six buttons, so every card fits on one line even on a phone.
- **Highlight the cards you own.** The highlight button on each Mainboard and Maybeboard line cycles **yellow** (I own this) → **red** (I don't have it yet) → none, tinting the whole line. A small legend above each list counts how many cards are marked each way. The highlights are saved with the deck, move with a card between Mainboard and Maybeboard, survive re-importing a list, and are private to you — shared deck pages don't show them. (When a card is highlighted, the automatic "Need" badge from your Collection is hidden for that line.)

### Under the hood
- **Nightly database backups.** A scheduled GitHub workflow makes a copy of the production database every night (kept for 6 days, then removed automatically by Neon), so there are six daily restore points on top of Neon's own 6 hours of history. Restore steps are in the README.
- **Account clean-up script.** `scripts/delete-user.mjs` previews and then deletes an account with all its decks and cards; it won't touch an account that has a password unless told to.

### Security
- **Accounts can no longer be taken over by signing up again.** Registering with an email that already exists is always refused, even if that account has no password. (Before, an old password-less account could be claimed by whoever registered its email first.)
- **Limits on the busy endpoints.** Simulate, suggestions, synergies, upgrades, lands, combos, deck import, card search and autocomplete, adding cards, and creating decks are now rate limited per account (a clear "try again in N seconds" message is shown). This keeps one person — or a script — from flooding the app, the database or Scryfall.
- **Size caps.** Deck names are limited to 100 characters, notes to 2,000, a card's quantity to 99, a deck to 400 different cards and an account to 100 decks. Pasted decklists are limited to 30,000 characters and 500 lines, and at most 20 unrecognised card names are looked up per import. Importing is now all-or-nothing, so a failed import can't leave a deck half empty.
- **Browser protections.** Every page now sends a Content-Security-Policy (only scripts carrying a per-request nonce can run; images only from this site and Scryfall; no framing), plus `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and `Cross-Origin-Opener-Policy`.
- **Updated dependencies.** Next.js 16.4.0 (fixes the advisories that affected 16.3.1) and matching Prisma packages, with `next` and `next-auth` pinned to exact versions. The remaining `npm audit` findings are in Prisma's command-line tool and in ESLint's glob handling — build-time only, never part of the running site.
- **Automated tests.** `npm test` now runs 80 tests, including one that walks every API route and checks it rejects anonymous requests and only ever looks up decks owned by the signed-in user. CI runs them on every push and pull request, and its token is read-only.

## 2026-10-06

### New
- **Lands tab.** A land balancer for your deck.
  - Compares each color's share of your mana symbols against how many lands can produce that color (green = covered, amber = short).
  - Choose which special lands you want — dual and fixing, fetch, tri-color, utility — and optionally type specific land names.
  - Each recommendation is shown as a full card with its colors, price, and a one-line reason, with **Yes** and **No** buttons.
  - **Yes** adds the land. If the deck is at 99 cards or already has 37 lands, it also swaps out a basic of whichever color you have the most spare sources of, so the deck stays in balance.
- **Hover previews on every card.** Hover a row in the Mainboard, Maybeboard, or a shared deck to see the full card. The same works on the card tiles in Suggestions, Synergies, Simulate, Salt, Keyword and Search, and on Upgrades thumbnails. The card is docked in one steady spot beside the list and never covers a row's buttons. Mouse only; hidden on narrow or phone layouts.
- **Prices everywhere.**
  - Every hover preview shows a USD price under the card.
  - Card tiles show a price line.
  - Upgrades show a price chip and the net cost of each swap, e.g. "Replaces Season of Growth ($0.27 · net +$0.30)".
  - The Lands review shows each land's price.
  - Combo pieces are now priced.
  - Basic lands count as free; cards without price data say "No price".
- **Automatic deploys.** The code lives on GitHub and every push to `main` is deployed to production by Vercel.

- **Password reset.** Every account now gets a one-time **recovery code** when it's created (shown once, stored only as a hash). On the new "Forgot your password?" page, enter your email, that code and a new password; the code is single-use and a fresh one is issued afterwards. If someone loses both, the site owner can reset them with `scripts/reset-password.mjs`.
- **Account page.** Change your password, generate a new recovery code, or permanently delete your account and decks — each asks for your current password.
- **Budget filter.** Pick a max price per card (up to $1 … $100) above the tools and every suggestion, synergy, upgrade, land and search list hides anything pricier. Cards with no known price stay visible. Your choice is remembered. Decks also list their five most expensive cards.
- **Playtest tab.** Shuffle your deck and draw an opening hand with a quick "keepable?" read, take mulligans (the first is free; later ones bottom a card, London-style) and draw turn by turn.
- **More export formats.** Plain text, with set codes (Moxfield / Archidekt), MTG Arena, MTG Online, and CSV with prices.
- **Collection page.** A new **Collection** page (link in the header) for the cards you own. Paste a list (Moxfield, Archidekt, Deckbox and TCGplayer exports all work) to add to or replace your collection, then search, sort, adjust copies, remove cards, copy or download the list, and see its estimated value. Decks mark cards you still **Need**, suggestions mark cards you already own, and the deck stats show what's still to buy, what it costs, and a copyable shopping list. Basic lands never count as missing.
- **Automatic checks.** A GitHub workflow typechecks, lints and builds every push and pull request.

### Under the hood
- **Faster repeat searches.** Scryfall search results are now saved in our own database for a day, so suggestions, synergies, upgrades and lands answer in a fraction of a second the second time (about 4–6 s → under 0.6 s in testing) and no longer burn through Scryfall's rate limit as more people use the app.
- **Sign-in and sign-up rate limiting.** Repeated attempts are slowed down: 8 sign-in tries per email and 30 per network every 15 minutes, and 6 sign-ups per network per hour. The limits are enforced on the sign-in endpoint itself, and the form shows a friendly "try again in a few minutes" message.
- **Smaller database connection pools** per server instance, so the app plays nicely with Neon's pooled connections as traffic grows.

### Improved
- **Add, Maybe and Remove buttons are always visible.** They are now full-width buttons under each card (previously they only appeared on hover), readable in light and dark mode.
- **Bigger cards.** Card grids are three across, so cards and buttons are easier to read and click.
- **Commander card.** Its Remove button is now a visible button under the card.
- **More varied land suggestions.** Each land family (true duals, pain and filter lands, any-color lands) contributes its own best picks so one family can't crowd out the others.

### Fixed
- Hover previews that never appeared (they were clipped by the list layout and only triggered on the exact name text).
- Duplicate land suggestions (e.g. Exotic Orchard appearing twice).
- Real dual lands (Breeding Pool, Steam Vents, …) being outranked by three-color lands.
- Poor lands ranked as best picks: lands with restricted or extra-cost mana, and lands whose colors only work from the opening hand (Gemstone Caverns), now rank lower.
- Combo pieces had no prices.

## 2026-10-01 – 2026-10-03

- **Accounts.** Email and password sign-up replaced Google sign-in. Existing password-less accounts can be claimed by registering their email.
- **Upgrades tab.** Checks recently released sets for better versions of cards you already run, gap-fillers, synergy cards, and nonbasic lands, with swap-in buttons and a badge when there are new sets to check.
- **Simulation.** The win-rate estimate now comes from 4,000 simulated games instead of 10, so it is stable from run to run. Shows 10 sample games, a margin of error, and a projection of your win rate if you filled your deck's gaps. The game model was also rebalanced.
- **Hosting.** Deployed to Vercel with a Neon Postgres database; a separate development database branch keeps local testing away from live data.
- **Deploy hardening.** Local environment files are excluded from deploy uploads.
- **Tooling.** Added Neon database tooling for development.
