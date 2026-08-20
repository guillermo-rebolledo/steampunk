# Sale dates come from the partner event record

A Sale without a deadline is not worth showing. A Discount with no visible end
reads as permanent; "4d 22h left" is why someone buys today. So the Sale layer
stands or falls on getting real start and end timestamps.

Steam publishes no endpoint that lists running campaigns with their dates. What
exists:

- **`api/featuredcategories`** — one clean JSON call listing the Spotlights up
  on the store front page and the Daily Deal. Carries a campaign label, artwork
  and a link, and **no dates at all**.
- **The Sale's own page** (`/sale/<slug>`) — its `application_config` element
  hangs a `data-partnereventstore` attribute carrying the campaign's partner
  event record, including `rtime32_start_time` and `rtime32_end_time`.

We take the Spotlights from the first and the timestamps from the second. A
Spotlight that points at a game rather than a `/sale/` slug is not a Sale and
costs no second fetch.

## Considered and rejected: inferring the window from Discount expiries

The ten curated specials in `api/featuredcategories` each carry a
`discount_expiration`, which is tempting: cluster the expiries of a campaign's
member Discounts and the campaign's own end falls out.

It does not. Expiries are staggered per publisher by seconds rather than
synchronised to the campaign, so the clusters are fuzzy and the inferred end is
wrong by minutes in a display that counts seconds. This was tried during design
and abandoned. The event record is the only reliable source.

## Consequences

**Two round trips deep, bounded, and cached.** Each Sale costs its own page
fetch, and a sale page is ~130KB of HTML read for two integers. ADR-0004
measured the limit: ~20 requests in a short window returns 429 and the block
persists for ~31 seconds, while ten in parallel are fine. Shelf assembly spends
five requests and the Spotlight lookup a sixth, so the layer caps itself at
three Sale pages — nine in the worst case, when a cold instance builds both at
once. Steam rarely promotes more than one or two Spotlight Sales at a time, so
the cap is a guard rail rather than a routine truncation. It counts campaigns
rather than slots: Steam promotes one campaign from several Spotlights at once,
and fetching its page once per slot would spend the whole cap on one Sale.

The layer is held for an hour and revalidated behind the visitor, on the same
`createCachedSource` the Shelf uses, so those nine requests are spent once an
hour per instance rather than once per visitor. Two caches rather than one:
the Shelf and the layer come from different endpoints and either has to be able
to fail without the other, which a single shared refresh could not offer.

**Whether a Sale is running is decided per visitor, not per refresh.** The
windows are stable facts and cache happily; whether a window contains this
moment does not. A campaign that runs out forty minutes into a cached hour has
to disappear on the next page load rather than the next refresh, so `activeAt`
is asked at serve time — and the instant it is asked at is the same one the
countdowns are seeded from.

**Assembly rejects only when Steam will not answer at all.** A 429 that was
swallowed into an empty layer would look like a success and would replace a
perfectly good set of Sales with nothing for the next hour, so the Spotlight
lookup failing is a rejection and the cache keeps serving what it had. Valid
JSON naming no campaigns is taken at its word: Steam is entitled to promote
nothing. Everything past that point fails soft — a Sale page that will not load
costs that one Sale.

**The Shelf never waits on the layer.** They are assembled and cached
separately, and the band streams behind its own Suspense boundary, so whatever
the layer costs is charged to itself. Measured on a cold instance with the
layer's fetches slowed to 4s: the Shelf reaches the wire at ~1.0s and the band
at ~9.3s. Awaiting both together — which is how this was first written — held
the Shelf back to ~9.2s, spending the whole page's latency on an optional band.

The fallback is nothing at all, because there is nothing honest to reserve space
for: whether there is a band is the question being waited on. When both caches
are warm the boundary resolves into the same flush, so nothing streams and
nothing moves.

**Sale membership is not resolved.** Which Discounts belong to a Sale exists only
as an announcement-derived proxy with false positives, at the cost of a
multi-megabyte fetch per Sale. So the Shelf below the layer is not any campaign's
line-up, and the interface has to say so rather than let the adjacency imply it.

**The Daily Deal gets no countdown.** `api/featuredcategories` gives a
`discount_expiration` for each of the ten curated specials but not for the Daily
Deal, and neither `api/appdetails` nor `api/packagedetails` carries one either.
It is shown with its depth and price and no clock. A guessed deadline would be
worse than none.

**Ordinary Shelf cards get no countdown.** Per-Discount expiry is absent from the
store-search results the Shelf is built from (ADR-0004). Countdowns are a
Sale-level thing, and nothing on a Shelf card may imply otherwise.
