# Parse Steam's store search HTML

Steam publishes no official API that enumerates discounted games. The options are:

- **`api/appdetails`** — official-ish, authoritative `price_overview`, but one app per
  request. Covering the corpus would take hours.
- **`api/featuredcategories`** — clean JSON, but only ~10 curated specials.
- **`search/results?specials=1&infinite=1`** — the full ~10,251, returned as
  `results_html`. Adding `json=1` returns `{name, logo}` with **no prices**, so the
  JSON mode is useless here.

We parse the search HTML. A row yields appid, name, capsule, discount percent, original
and final price, release date, tag ids, review summary and platform support — everything
the Shelf needs.

## Consequences

The data layer is coupled to markup we do not control and that carries no compatibility
guarantee. Parsing must fail soft: a row that does not yield an appid and a price is
skipped, never thrown.

Steam rate-limits this endpoint. Measured: 10 parallel page fetches succeed in ~575ms;
~20 in a short window return **HTTP 429**, and once tripped the block persists for about
**31 seconds** — throttling after the fact does not lift it. So bursts must be bounded
(5 pages per Shelf), and a 429 must serve the last good Shelf rather than an error.

Per-discount expiry is **not** in the search HTML. Countdowns are therefore only possible
at the Sale level, never on an ordinary Shelf card. (This originally said "and for the
Daily Deal" too; ADR-0006 found Steam publishes no expiry for the Daily Deal either.)
