# Steampunk

Browse well-reviewed games currently discounted on Steam, framed by the named store
campaigns those discounts belong to.

Deliberately **not** a complete index of Steam discounts. Steam has roughly 10,251 games
discounted at any moment; only ~4,650 are Rankable (have enough reviews to sort by
score). The app holds a Shelf of ~500 per region. Showing every price cut is a non-goal;
showing ones worth buying is the goal.

## Getting started

```bash
pnpm install
pnpm dev
```

## Scripts

| Script | What it does |
| --- | --- |
| `pnpm dev` | Run the app locally |
| `pnpm build` | Production build |
| `pnpm test` | Run the test suite once |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm typecheck` | Type-check without emitting |
| `pnpm lint` | Lint |

## Before you change anything

- **`CONTEXT.md`** — the domain glossary. Use its vocabulary (Discount, Sale, Shelf,
  Rankable, Discount depth) in code, tests and interface copy.
- **`docs/adr/`** — the decisions of record. Where this README and an ADR disagree, the
  ADR wins.

Three decisions worth knowing before you read the code:

- Discounts are selected by **review score**, not discount depth, because Steam's store
  search silently ignores a discount sort (ADR-0001).
- Filtering happens **client-side within the Shelf**, not by delegating to Steam's query
  parameters (ADR-0003). Interface copy must therefore never imply complete coverage.
- Countdowns belong to **Sales, never to Discounts** (ADR-0006). A Sale's real window
  comes from the partner event record on its page; per-Discount expiry is absent from
  the store-search payload the Shelf is built from, so no Shelf card may carry a clock
  or appear to share a campaign's deadline.

## Fonts

- **Geist Sans** (body) and **Geist Mono** (monospace) via `next/font/google`.
- **[Departure Mono](https://departuremono.com/)** (headings only) — self-hosted via
  `next/font/local` from `src/fonts/`. Despite the name it is not the monospace face
  here; `font-mono` is Geist Mono.

Departure Mono is © 2022–2024 Helena Zhang and licensed under the **SIL Open Font
License 1.1**; the licence ships beside the font at
`src/fonts/DepartureMono-LICENSE.txt` and must stay there. No Reserved Font Name is
declared. (The project's GitHub repo carries an MIT licence, but that covers the
website source, not the font software.)

It ships a **single Regular weight — no bold, no italic**. `globals.css` sets
`font-synthesis-weight: none` on headings so nothing renders a smeared faux-bold; use
size and colour for emphasis instead of weight.

## Testing

Tests are written at a single seam: the data layer's **injected fetcher**. Everything
downstream of the network — parsing, Shelf assembly, caching, price normalisation — is
exercised through it against real captured Steam payloads, never mocked in isolation.
Filtering and sorting are pure functions over a Shelf and are tested directly.

The captured payloads live beside the code that parses them. Recapture any of them by
saving the response body verbatim:

```bash
# The Shelf — one file per page, all five captured in the same burst so they
# are one consistent slice of the ranking rather than five moments
for start in 0 100 200 300 400; do
  curl "https://store.steampowered.com/search/results?specials=1&infinite=1&sort_by=Reviews_DESC&start=$start&count=100&cc=us&l=english" \
    > "src/lib/shelf/fixtures/store-search/start-$start.json"
done

# The Sale layer: which campaigns are up, and one campaign's page
curl "https://store.steampowered.com/api/featuredcategories?cc=us&l=english" \
  > src/lib/sales/fixtures/featured-categories.json
curl "https://store.steampowered.com/sale/SEGAPublisherSale2026?cc=us&l=english" \
  > src/lib/sales/fixtures/sale-page.html
```

The sale-page capture is what makes a real countdown testable: its partner event record
holds the campaign's true start and end, and the tests judge it against pinned instants
before, during and after that window. Recapturing it with a different campaign means
updating the expected timestamps to that campaign's.

Issues live in Linear, not GitHub Issues — see `docs/agents/issue-tracker.md`.
