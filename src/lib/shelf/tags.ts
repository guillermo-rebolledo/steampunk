import tagNames from "@/lib/shelf/steam-tags.json";

/**
 * Steam's tag ids, named.
 *
 * A store-search row carries `data-ds-tagids="[492,19,3871]"` and no names at
 * all, so this is the only thing that turns a Discount's tags into something a
 * person can filter by. The list is vendored rather than fetched — ADR-0005
 * says why, and how to refresh it.
 */
const names: Record<string, string> = tagNames;

/**
 * Names a list of tag ids: trimmed, deduplicated, and dropping any this list
 * has no name for.
 *
 * Dropping unknown ids is deliberate: an id minted since the last refresh
 * would otherwise surface as a bare number in the filter panel. Losing a tag
 * costs one filter option; showing "1073215" costs the user's trust in all of
 * them.
 *
 * Deduplicating keeps a Discount's tags a set rather than a bag, which is
 * what everything downstream assumes — a repeat would count twice in the
 * facet counts and could claim more Discounts carry a tag than exist.
 *
 * Trimming is not defensive: Steam publishes "Parody " and "Dystopian " with
 * a trailing space, and a tag name is sorted alphabetically and compared by
 * value, so the space would misplace the chip and split the tag in two the
 * moment anything keys on the name. The vendored file keeps Steam's names
 * verbatim so it stays a faithful capture; this is where they are cleaned.
 */
export function nameTags(tagIds: readonly number[]): string[] {
  const named = tagIds
    .map((id) => names[String(id)]?.trim())
    .filter((name) => !!name);
  return [...new Set(named)];
}
