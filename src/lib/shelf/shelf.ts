import type { Fetcher } from "@/lib/shelf/fetcher";
import { parseStoreSearchRows } from "@/lib/shelf/parse-store-search";
import type { Discount, Shelf } from "@/lib/shelf/types";

const SEARCH_URL = "https://store.steampowered.com/search/results";

/** Steam serves 100 rows a page. */
export const PAGE_SIZE = 100;

/**
 * Five pages, ~500 Discounts — the whole Shelf (ADR-0002).
 *
 * This is a ceiling rather than a number to tune upward. Measured against live
 * Steam: five pages in parallel land in ~400ms, but roughly twenty requests in
 * a short window return HTTP 429, and once tripped that block holds for about
 * 31 seconds no matter how politely you pace afterwards (ADR-0004). Raising
 * this trades a bigger Shelf for a Shelf that periodically cannot be built.
 */
export const PAGE_COUNT = 5;

type SearchEnvelope = {
  results_html?: unknown;
  total_count?: unknown;
};

type Page = {
  readonly discounts: readonly Discount[];
  readonly totalRankable: number;
};

/**
 * Fetches Steam's discounted games and assembles the Shelf.
 *
 * Selection is by review score, not by Discount depth — Steam silently ignores
 * a discount sort, so there is no server-side way to ask for the deepest cuts
 * (ADR-0001). The order Steam returns is the order the Shelf keeps.
 *
 * Assembly is all-or-nothing: if any page fails, so does the Shelf. A Shelf is
 * the top slice of a ranking, and quietly dropping the page that failed would
 * hand the visitor a different, worse sample under the same name. Rejecting is
 * what lets the caller serve the last good Shelf instead — see `cache.ts`.
 */
export async function fetchShelf({
  fetcher,
}: {
  fetcher: Fetcher;
}): Promise<Shelf> {
  const pages = await Promise.all(
    // In parallel, because five sequential round trips to Steam is the whole
    // cold-start budget spent on waiting. Five at once is well inside the
    // measured rate limit.
    Array.from({ length: PAGE_COUNT }, (_, page) =>
      fetchPage({ fetcher, start: page * PAGE_SIZE }),
    ),
  );

  const discounts = dedupe(pages.flatMap((page) => page.discounts));
  if (discounts.length === 0) {
    throw new Error("Steam store search yielded no Discounts at all");
  }

  return { discounts, totalRankable: pages[0].totalRankable };
}

async function fetchPage({
  fetcher,
  start,
}: {
  fetcher: Fetcher;
  start: number;
}): Promise<Page> {
  const response = await fetcher(pageUrl(start));
  if (!response.ok) {
    throw new Error(
      `Steam store search at ${start} failed with ${response.status} ${response.statusText}`,
    );
  }

  const envelope = await readEnvelope(response, start);
  const resultsHtml =
    typeof envelope.results_html === "string" ? envelope.results_html : null;
  const totalRankable =
    typeof envelope.total_count === "number" ? envelope.total_count : null;
  if (resultsHtml === null || totalRankable === null) {
    throw new Error(
      `Steam store search at ${start} returned an unreadable envelope`,
    );
  }

  const discounts = parseStoreSearchRows(resultsHtml);
  // Individual rows fail soft — the parser drops what it cannot read. A whole
  // page yielding nothing is different: Steam still claims results this far
  // in, so the markup has moved under us and the Shelf cannot be trusted.
  // Past `total_count` an empty page is just Steam running out of results.
  if (discounts.length === 0 && start < totalRankable) {
    throw new Error(`Steam store search at ${start} yielded no Discounts`);
  }

  return { discounts, totalRankable };
}

function pageUrl(start: number): string {
  const url = new URL(SEARCH_URL);
  url.search = new URLSearchParams({
    specials: "1",
    // Returns the rows as `results_html`. `json=1` looks tidier but drops
    // every price, which makes it useless here (ADR-0004).
    infinite: "1",
    sort_by: "Reviews_DESC",
    start: String(start),
    count: String(PAGE_SIZE),
    // Regions are a later ticket; until then the Shelf is the US one.
    cc: "us",
    l: "english",
  }).toString();
  return url.toString();
}

/** A rate-limit or outage page is HTML, not JSON, and `json()` throws on it. */
async function readEnvelope(
  response: Response,
  start: number,
): Promise<SearchEnvelope> {
  try {
    return (await response.json()) as SearchEnvelope;
  } catch {
    throw new Error(`Steam store search at ${start} returned unreadable JSON`);
  }
}

/**
 * Steam's ranking shifts between the five parallel requests, so the same game
 * can come back on two pages. It is one Discount, and the Shelf holds it once.
 *
 * Keyed on the store URL rather than the app id, because the app id is not an
 * identity here: a `/sub/` row lists every app its package covers and the
 * parser takes the first, so a package and the single game it leads with
 * report the same app id while being two different things to buy.
 */
function dedupe(discounts: readonly Discount[]): readonly Discount[] {
  const held = new Set<string>();
  return discounts.filter((discount) => {
    if (held.has(discount.storeUrl)) return false;
    held.add(discount.storeUrl);
    return true;
  });
}
