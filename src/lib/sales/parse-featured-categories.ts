import type { Price } from "@/lib/shelf/types";
import type { DailyDeal, Spotlight } from "@/lib/sales/types";

/**
 * Reads Spotlights and the Daily Deal out of Steam's `featuredcategories`.
 *
 * This is the one Steam endpoint that answers "what campaigns are running
 * right now?" in clean JSON, which is why the Sale layer starts here rather
 * than in the store-search HTML the Shelf is parsed from (ADR-0004, ADR-0006).
 *
 * Steam returns the Spotlight slots under numeric keys, one category per slot,
 * and shuffles their order between requests — so they are found by their `id`,
 * never by position. Fails soft: a malformed slot is dropped, not thrown.
 */

type Category = {
  id?: unknown;
  items?: unknown;
};

type SpotlightItem = {
  name?: unknown;
  header_image?: unknown;
  url?: unknown;
};

type DailyDealItem = {
  id?: unknown;
  name?: unknown;
  header_image?: unknown;
  currency?: unknown;
  original_price?: unknown;
  final_price?: unknown;
  discount_percent?: unknown;
};

export function parseSpotlights(payload: unknown): Spotlight[] {
  return categories(payload, "cat_spotlight")
    .flatMap((category) => items<SpotlightItem>(category))
    .map(toSpotlight)
    .filter((spotlight): spotlight is Spotlight => spotlight !== null);
}

export function parseDailyDeal(payload: unknown): DailyDeal | null {
  for (const category of categories(payload, "cat_dailydeal")) {
    for (const item of items<DailyDealItem>(category)) {
      const deal = toDailyDeal(item);
      if (deal !== null) return deal;
    }
  }
  return null;
}

function categories(payload: unknown, id: string): Category[] {
  if (typeof payload !== "object" || payload === null) return [];
  return Object.values(payload as Record<string, unknown>).filter(
    (value): value is Category =>
      typeof value === "object" &&
      value !== null &&
      (value as Category).id === id,
  );
}

/**
 * The items of a category, with anything that is not an object dropped.
 *
 * The payload is untrusted `unknown` all the way down, and a `null` or a bare
 * string in this array would otherwise reach a reader that goes straight for a
 * field — which throws, and takes the whole layer with it rather than the one
 * malformed slot.
 */
function items<T>(category: Category): T[] {
  if (!Array.isArray(category.items)) return [];
  return category.items.filter(
    (item): item is object => typeof item === "object" && item !== null,
  ) as T[];
}

function toSpotlight(item: SpotlightItem): Spotlight | null {
  const label = typeof item.name === "string" ? item.name.trim() : "";
  const artworkUrl = renderableImage(item.header_image);
  const url = typeof item.url === "string" ? item.url : "";
  if (!label || artworkUrl === null || !url) return null;

  return { label, artworkUrl, url };
}

function toDailyDeal(item: DailyDealItem): DailyDeal | null {
  const appId = integer(item.id);
  const title = typeof item.name === "string" ? item.name.trim() : "";
  const headerUrl = renderableImage(item.header_image);
  const depth = integer(item.discount_percent);
  const originalAmount = integer(item.original_price);
  const finalAmount = integer(item.final_price);
  const currency = typeof item.currency === "string" ? item.currency : "";

  if (appId === null || appId <= 0 || !title || headerUrl === null) return null;
  // Steam states depth as a whole percentage. Anything outside 1–100 is not a
  // Discount depth, whatever else it is.
  if (depth === null || depth <= 0 || depth > 100) return null;
  // A price below zero is not a price, and the pair has to be a real cut
  // rather than merely ordered — "-$2.00, down from -$1.00" satisfies the
  // ordering and nothing else.
  if (originalAmount === null || finalAmount === null) return null;
  if (finalAmount < 0 || finalAmount >= originalAmount) return null;

  return {
    appId,
    title,
    headerUrl,
    storeUrl: `https://store.steampowered.com/app/${appId}/`,
    depth,
    originalPrice: price(originalAmount, currency),
    finalPrice: price(finalAmount, currency),
  };
}

/**
 * Unlike the store-search rows, this endpoint gives integers and a currency
 * code but no preformatted price string, so the label has to be built.
 *
 * The currency decides how many minor units make a major one — 100 for USD,
 * 1 for JPY — and `Intl` already knows which, so the split is asked for rather
 * than assumed. That is stricter than the Shelf parser, which reads a price
 * back out of its own display string and so quietly assumes two decimals.
 */
function price(amount: number, currency: string): Price {
  try {
    const format = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    });
    const decimals = format.resolvedOptions().maximumFractionDigits ?? 2;
    return { amount, label: format.format(amount / 10 ** decimals) };
  } catch {
    // An unknown currency code makes `Intl` throw. Losing the symbol beats
    // losing the Daily Deal.
    return { amount, label: String(amount) };
  }
}

/**
 * An image URL `next/image` will actually accept, or `null`.
 *
 * `next.config.ts` allows HTTPS under `steamstatic.com` and nothing else, and
 * an `Image` handed anything outside that throws where it renders — taking the
 * page down, which is the one thing this layer is not allowed to do. Steam
 * moving its artwork to another host has to cost the item, not the render, so
 * the check happens here rather than at the `Image`.
 */
function renderableImage(value: unknown): string | null {
  if (typeof value !== "string") return null;

  try {
    const { protocol, hostname } = new URL(value);
    return protocol === "https:" && hostname.endsWith(".steamstatic.com")
      ? value
      : null;
  } catch {
    return null;
  }
}

function integer(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
