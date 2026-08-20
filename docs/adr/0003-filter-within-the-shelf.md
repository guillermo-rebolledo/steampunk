# Filter within the Shelf, not against Steam

Steam's store search accepts filters that compose server-side and run against the whole
discount corpus — `tags=19` (1,785 results), `tags=19,492` (821), `maxprice=5` (7,868),
`os=linux` (1,627), `term=<text>`. Delegating the app's filters to those parameters
would let every filter see all ~4,650 Rankable Discounts.

We deliberately do not do this. The Shelf is fetched once per region and **all filtering,
sorting and searching happens client-side within it**.

## Consequences

Interactions are instant and cost zero requests — no loading state on a filter toggle,
no request per keystroke, no per-combination cache entries.

The price is that filters are scoped to the Shelf and not to Steam. "Action games on
sale" means "Action games among the Shelf", not among all 1,785 discounted Action games.
**The UI must say so**, or it is lying to the user. Narrow filter combinations will
return few results, and that is a property of the design rather than a bug — which is
also why the Shelf is sized larger than a pure browse experience would need.

Someone will eventually propose delegating filters to Steam's query parameters. It is a
genuine improvement on result completeness and a genuine regression on interaction
latency; this is the trade that was made, not an oversight.
