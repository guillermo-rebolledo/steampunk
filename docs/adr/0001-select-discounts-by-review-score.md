# Select discounts by review score, not discount depth

Steam's store search accepts a `sort_by` parameter but **silently ignores unrecognised
values**, serving default relevance order instead — `sort_by=Discount_DESC` returns the
same unsorted results as a deliberately invalid `sort_by=_ASC`. There is no server-side
way to rank discounts by depth. Only `Price_ASC`, `Reviews_DESC` and `Released_DESC`
genuinely sort.

Ranking all ~10,251 live discounts by depth would therefore require downloading every
one of the 103 result pages and sorting locally. We hold only a few hundred (see
ADR-0002), so we select them with `Reviews_DESC` — "well-reviewed games that happen to
be discounted" — and allow re-sorting by discount depth *within* that set.

## Consequences

The app cannot truthfully claim to show "the biggest discounts on Steam". It shows the
biggest discounts **among well-reviewed games**, and the UI must say so. A 95%-off
asset flip will never appear.

This was confirmed as the intended product scope, not a limitation accepted under
protest: "best-reviewed games on sale is fine, it is not needed to be all". Combined
with ADR-0002 and ADR-0003, the app surfaces roughly 5% of live Steam discounts by
design. Narrowness here is the feature — do not "fix" it by widening the corpus without
revisiting this decision first.
