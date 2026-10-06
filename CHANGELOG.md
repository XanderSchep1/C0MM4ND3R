# Changelog

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
