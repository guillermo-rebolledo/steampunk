import type { Fetcher } from "@/lib/shelf/fetcher";
import {
  parseDailyDeal,
  parseSpotlights,
} from "@/lib/sales/parse-featured-categories";
import { parseSaleWindow } from "@/lib/sales/parse-sale-page";
import type { Sale, SaleLayer, Spotlight } from "@/lib/sales/types";

const FEATURED_URL = "https://store.steampowered.com/api/featuredcategories";
const STORE_ORIGIN = "https://store.steampowered.com";

/**
 * How many Sale pages one render may fetch.
 *
 * ADR-0004 measured Steam's limit: ~20 requests in a short window returns 429
 * and the block then persists for ~31 seconds, while ten in parallel are fine.
 * Shelf assembly spends five and the Spotlight lookup a sixth, so this caps
 * the layer at three more — nine in the worst case, when a cold instance
 * builds both at once, and only once an hour after that.
 *
 * Steam rarely promotes more than one or two Spotlight Sales at a time, so
 * this is a guard rail rather than a routine truncation.
 */
const MAX_SALE_PAGES = 3;

/**
 * Assembles the Sale layer: the campaigns running right now, and the Daily
 * Deal.
 *
 * Two round trips deep by necessity. `featuredcategories` says which
 * Spotlights are up but carries no dates; a Sale's real window lives only in
 * the partner event record on its own page, so each Sale costs a second fetch
 * (ADR-0006).
 *
 * Rejects only when Steam will not say which campaigns are up at all. That
 * distinction is what the cache above needs: an assembly that swallowed a 429
 * and returned an empty layer would look like a success, and would replace a
 * perfectly good set of Sales with nothing for the next hour. Past that point
 * everything fails soft — a Sale page that will not load costs that one Sale,
 * and markup that has moved costs the Sale it moved under.
 *
 * The Shelf is never at risk either way. The two are assembled and cached
 * separately, and the page renders the band above the Shelf only if there is
 * one to render.
 *
 * Every Sale found is returned, running or not. What gets cached must not have
 * a moment in time baked into it: `activeAt` decides which are still running,
 * and it is asked when a visitor is served rather than when Steam was.
 */
export async function fetchSaleLayer({
  fetcher,
}: {
  fetcher: Fetcher;
}): Promise<SaleLayer> {
  const featured = await fetchFeatured(fetcher);

  const sales = await Promise.all(
    salesPromoted(parseSpotlights(featured))
      .slice(0, MAX_SALE_PAGES)
      .map((promoted) => fetchSale(fetcher, promoted)),
  );

  return {
    sales: sales.filter((sale): sale is Sale => sale !== null),
    dailyDeal: parseDailyDeal(featured),
  };
}

/**
 * The Sales running at `now`, soonest to end first — the closer the deadline,
 * the more the countdown is worth reading.
 *
 * A Sale that has ended is not presented as active, and neither is one that
 * has not started: Steam puts a Spotlight up for a campaign before it opens.
 */
export function activeAt(sales: readonly Sale[], now: number): Sale[] {
  return sales
    .filter(({ startsAt, endsAt }) => startsAt <= now && now < endsAt)
    .sort((a, b) => a.endsAt - b.endsAt);
}

/**
 * The Sales the Spotlights promote, one entry each.
 *
 * Two jobs, and they have to happen together. Spotlights that point at a game
 * are dropped — most do, and those cannot carry a campaign window at all. And
 * a campaign Steam is promoting from several slots at once is still one
 * campaign: taking it once is what stops the cap below being spent three times
 * on the same sale page, and stops the band drawing the same Sale three times
 * under three identical keys.
 *
 * Which slot wins is arbitrary — Steam shuffles them between requests — but
 * duplicates of one campaign carry the same label and artwork, so there is
 * nothing to choose between them.
 */
function salesPromoted(spotlights: readonly Spotlight[]): PromotedSale[] {
  const bySlug = new Map<string, PromotedSale>();

  for (const spotlight of spotlights) {
    const slug = saleSlug(spotlight.url);
    if (slug !== null && !bySlug.has(slug)) bySlug.set(slug, { slug, spotlight });
  }

  return [...bySlug.values()];
}

type PromotedSale = { readonly slug: string; readonly spotlight: Spotlight };

async function fetchSale(
  fetcher: Fetcher,
  { slug, spotlight }: PromotedSale,
): Promise<Sale | null> {
  const html = await fetchText(fetcher, salePageUrl(slug));
  if (html === null) return null;

  const window = parseSaleWindow(html);
  if (window === null) return null;

  return {
    id: window.id,
    // The event record names the campaign in full ("SEGA Publisher Sale
    // 2026"); the Spotlight only carries the shorter label ("Publisher Sale").
    name: window.name,
    label: spotlight.label,
    artworkUrl: spotlight.artworkUrl,
    url: `${STORE_ORIGIN}/sale/${slug}/`,
    startsAt: window.startsAt,
    endsAt: window.endsAt,
  };
}

/**
 * The slug of the Sale a Spotlight points at, or `null` if it points at a
 * game instead — most Spotlights do, and those cannot become Sales.
 */
function saleSlug(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.origin !== STORE_ORIGIN) return null;
    const [section, slug] = parsed.pathname.split("/").filter(Boolean);
    return section === "sale" && slug ? slug : null;
  } catch {
    return null;
  }
}

function featuredUrl(): string {
  const url = new URL(FEATURED_URL);
  // Regions are a later ticket; until then the layer is the US one, matching
  // the Shelf below it.
  url.search = new URLSearchParams({ cc: "us", l: "english" }).toString();
  return url.toString();
}

function salePageUrl(slug: string): string {
  const url = new URL(`${STORE_ORIGIN}/sale/${slug}`);
  url.search = new URLSearchParams({ cc: "us", l: "english" }).toString();
  return url.toString();
}

/**
 * Steam's answer to "what is being promoted right now?", or a failure.
 *
 * Valid JSON is taken at its word even when it names no campaigns: Steam is
 * entitled to be promoting nothing, and an empty layer is a real answer. What
 * is not an answer is a 429, a dead connection, or an outage page — and those
 * have to be told apart from an empty one, because only one of them should
 * replace what is already on screen.
 */
async function fetchFeatured(fetcher: Fetcher): Promise<unknown> {
  const url = featuredUrl();
  const body = await fetchText(fetcher, url);
  if (body === null) {
    throw new Error(`Steam would not say which campaigns are up (${url})`);
  }

  try {
    return JSON.parse(body);
  } catch (cause) {
    throw new Error(`Steam answered ${url} with something that is not JSON`, {
      cause,
    });
  }
}

async function fetchText(fetcher: Fetcher, url: string): Promise<string | null> {
  try {
    const response = await fetcher(url);
    return response.ok ? await response.text() : null;
  } catch {
    // A rejected fetch is a network fault, not a bug in the layer.
    return null;
  }
}
