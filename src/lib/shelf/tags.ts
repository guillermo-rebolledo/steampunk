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
 * Names a list of tag ids, dropping any this list has no name for.
 *
 * Dropping is deliberate: an id minted since the last refresh would otherwise
 * surface as a bare number in the filter panel. Losing a tag costs one filter
 * option; showing "1073215" costs the user's trust in all of them.
 */
export function nameTags(tagIds: readonly number[]): string[] {
  return tagIds.map((id) => names[String(id)]).filter((name) => !!name);
}
