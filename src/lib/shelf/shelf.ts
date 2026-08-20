import type { Fetcher } from "@/lib/shelf/fetcher";
import { parseStoreSearchRows } from "@/lib/shelf/parse-store-search";
import type { Shelf } from "@/lib/shelf/types";

const SEARCH_URL = "https://store.steampowered.com/search/results";

/** Steam serves 100 rows a page; this is one page of them (ADR-0002). */
const PAGE_SIZE = 100;

type SearchResponse = {
  results_html?: unknown;
  total_count?: unknown;
};

/**
 * Fetches one page of Steam's discounted games and assembles the Shelf.
 *
 * Selection is by review score, not by Discount depth — Steam silently ignores
 * a discount sort, so there is no server-side way to ask for the deepest cuts
 * (ADR-0001). The order Steam returns is the order the Shelf keeps.
 */
export async function fetchShelf({
  fetcher,
}: {
  fetcher: Fetcher;
}): Promise<Shelf> {
  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({
    specials: "1",
    // Returns the rows as `results_html`. `json=1` looks tidier but drops
    // every price, which makes it useless here (ADR-0004).
    infinite: "1",
    sort_by: "Reviews_DESC",
    start: "0",
    count: String(PAGE_SIZE),
    // Regions are a later ticket; until then the Shelf is the US one.
    cc: "us",
    l: "english",
  }).toString();

  const response = await fetcher(url.toString());
  if (!response.ok) {
    // ADR-0004 says a 429 must serve the last good Shelf rather than an error,
    // and Steam trips one after ~20 requests in a short window. There is no
    // last good Shelf to serve until MEM-163 adds the cache, so until then a
    // rate limit surfaces as a failed page rather than a stale one.
    throw new Error(
      `Steam store search failed with ${response.status} ${response.statusText}`,
    );
  }

  const payload = (await response.json()) as SearchResponse;
  const resultsHtml =
    typeof payload.results_html === "string" ? payload.results_html : "";

  return {
    discounts: parseStoreSearchRows(resultsHtml),
    totalRankable:
      typeof payload.total_count === "number" ? payload.total_count : 0,
  };
}
