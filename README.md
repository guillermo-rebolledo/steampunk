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

Two decisions worth knowing before you read the code:

- Discounts are selected by **review score**, not discount depth, because Steam's store
  search silently ignores a discount sort (ADR-0001).
- Filtering happens **client-side within the Shelf**, not by delegating to Steam's query
  parameters (ADR-0003). Interface copy must therefore never imply complete coverage.

## Fonts

- **Geist Sans** (body) via `next/font/google`.
- **[Departure Mono](https://departuremono.com/)** (headings and monospace) —
  self-hosted via `next/font/local` from `src/fonts/`.

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

Issues live in Linear, not GitHub Issues — see `docs/agents/issue-tracker.md`.
