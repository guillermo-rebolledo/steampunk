# A bounded Shelf, fetched on demand, with no datastore

Steam has ~10,251 games discounted at any moment, reachable only as 103 paginated pages
of HTML (100 rows each, ~250KB per page). Ingesting all of them means a scheduled
scraper, somewhere to put the results, and a staleness policy.

We hold a **Shelf** of a few hundred Discounts instead, fetched on demand from a handful
of search pages and cached. No database, no cron, no background jobs.

## Considered options

- **The 10 curated specials** from `api/featuredcategories` — one clean JSON call, no
  HTML parsing at all, but ten games is not a browsable app.
- **All ~10,251** — full coverage and true global ranking, at the cost of a datastore
  and a scheduled ingest.
- **A few hundred** (chosen) — enough to browse, sort and filter, while the whole app
  stays a Next.js frontend with no infrastructure behind it.

## Consequences

"Simple web app" stays true: the entire thing deploys as one Next.js app. The cost is
that every view is a sample, never the whole truth — see ADR-0001 for how the sample is
chosen, which is the decision that makes or breaks whether the sample is any good.
