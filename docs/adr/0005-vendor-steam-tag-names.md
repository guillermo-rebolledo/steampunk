# Vendor Steam's tag names rather than fetching them

A store-search row names its tags nowhere. It carries `data-ds-tagids="[492,19,3871]"`
and nothing else, so filtering the Shelf by tag or genre needs an id → name lookup that
Steam does not ship inside the markup we already parse.

Steam publishes one at `store.steampowered.com/tagdata/populartags/english` — 430 tags,
~15KB. We **check that list into the repo** (`src/lib/shelf/steam-tags.json`) and
resolve names at parse time, rather than fetching it alongside the Shelf.

Steam serves it as an array of `{tagid, name}`; we store it as a map keyed by
`tagid`, sorted numerically, one name per id. Refresh it with:

```sh
# Via a temporary file, and moved into place only once jq has confirmed a
# non-empty object: redirecting straight onto the vendored file truncates it
# before the request is even made, so a bad day at Steam would empty it.
# `sort_by(.tagid)` and not `jq -S`, which sorts "100" before "19".
curl -sS --fail https://store.steampowered.com/tagdata/populartags/english |
  jq -e 'sort_by(.tagid) | map({(.tagid|tostring): .name}) | add
         | if length > 0 then . else error("no tags") end' \
  > steam-tags.json.new &&
  mv steam-tags.json.new src/lib/shelf/steam-tags.json
```

## Considered options

- **Fetch it per Shelf** — always current, but doubles the requests a page render makes
  against a host that starts returning 429 after roughly twenty of them (ADR-0004), to
  refresh data that changes a few times a year.
- **Show raw tag ids** — no lookup at all, and no user would recognise "492".
- **Vendor the list** (chosen) — zero extra requests, and the Shelf stays a thing
  fetched once.

## Consequences

Tag ids are permanent — Steam has never reassigned one — so a stale file cannot mislabel
a game. It can only fail to label it: a tag minted after the last refresh resolves to
nothing and is dropped from that game's tag list, which costs one filter option and
never a wrong one. All 182 distinct tags across the captured 100-row Shelf resolve
against this list.

The tag filter is therefore scoped twice over: to the Shelf (ADR-0003) and to the tags
this file knows. Both narrow, neither lies.
