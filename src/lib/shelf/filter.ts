import type { Discount, PlatformSupport, Shelf } from "@/lib/shelf/types";

/**
 * Narrowing the Shelf.
 *
 * Everything here is a pure function of a Shelf and a set of filters — Shelf
 * in, Shelf out. Nothing fetches, nothing caches, nothing is async, because
 * ADR-0003 puts filtering inside the Shelf rather than delegating it to
 * Steam's query parameters. That decision is what makes a filter toggle feel
 * like changing a view instead of issuing a query, and it is also why a
 * narrow combination legitimately returns nothing: the Shelf is a few hundred
 * well-reviewed Discounts, not Steam's ten thousand.
 */

export type Platform = keyof PlatformSupport;

/** The platforms, in the order they are offered and listed. */
export const PLATFORMS: readonly Platform[] = ["windows", "mac", "linux"];

export type ShelfFilters = {
  /** Matched against the game's name only. Blank means no search. */
  readonly search: string;
  /** A Discount must carry *every* selected tag. Empty means any. */
  readonly tags: readonly string[];
  /** Inclusive ceiling on the price paid, in minor units. Null means any. */
  readonly maxPrice: number | null;
  /** Inclusive floor on Discount depth, as a percentage. 0 means any. */
  readonly minDepth: number;
  /** A Discount must run on *every* selected platform. Empty means any. */
  readonly platforms: readonly Platform[];
};

/** The whole Shelf, nothing narrowed. */
export const UNFILTERED: ShelfFilters = {
  search: "",
  tags: [],
  maxPrice: null,
  minDepth: 0,
  platforms: [],
};

/** One tag the Shelf carries, and how many of its Discounts carry it. */
export type TagCount = {
  readonly name: string;
  readonly count: number;
};

/**
 * Narrows a Shelf to the Discounts matching every filter.
 *
 * Filters compose by intersection — each one only ever removes Discounts — so
 * the count on screen falls monotonically as controls are added. The Shelf's
 * own order is preserved: it is Steam's review ranking, and re-sorting is a
 * different concern (MEM-164).
 *
 * `totalRankable` survives untouched. It is how many Rankable Discounts Steam
 * says are live, and filtering the Shelf changes nothing about Steam — the
 * interface needs that number intact to keep telling the truth about how small
 * a slice this is.
 */
export function filterShelf(shelf: Shelf, filters: ShelfFilters): Shelf {
  const query = normalise(filters.search);

  return {
    ...shelf,
    discounts: shelf.discounts.filter(
      (discount) =>
        matchesSearch(discount, query) &&
        matchesTags(discount, filters.tags) &&
        matchesPrice(discount, filters.maxPrice) &&
        matchesDepth(discount, filters.minDepth) &&
        matchesPlatforms(discount, filters.platforms),
    ),
  };
}

/**
 * How many filters are doing something.
 *
 * Each selected tag and each selected platform counts on its own, because
 * each is a separate thing the visitor turned on and a separate thing they
 * might want back.
 *
 * Zero is what "clear all" is offered for, and what tells an empty result
 * apart from an empty Shelf. The number itself is for a filter surface that
 * can be collapsed: a badge saying how much is narrowing the Shelf out of
 * sight.
 */
export function activeFilterCount(filters: ShelfFilters): number {
  return (
    (normalise(filters.search) === "" ? 0 : 1) +
    filters.tags.length +
    (filters.maxPrice === null ? 0 : 1) +
    (filters.minDepth > 0 ? 1 : 0) +
    filters.platforms.length
  );
}

/**
 * Whether anything is set that "clear" would undo.
 *
 * Wider than `activeFilterCount` by exactly one case: a search of nothing but
 * whitespace narrows nothing, so it counts as no filter — but the text is
 * still sitting in the box, and a clear button that will not empty a box with
 * something in it reads as broken.
 */
export function isClearable(filters: ShelfFilters): boolean {
  return activeFilterCount(filters) > 0 || filters.search !== "";
}

/**
 * Every tag across the given Discounts with its count, commonest first and
 * alphabetical within a tie.
 *
 * Hand it the Shelf as the other filters have already narrowed it and the
 * counts become facets: "Action 17" means seventeen of the Discounts that
 * survive your other filters are Action, so picking it lands on seventeen
 * rather than on a number the interface never showed you. It is also the
 * honest version of the disclaimer — a count that small says how small this
 * slice is better than any sentence can.
 */
export function tagsOnShelf(shelf: Shelf): TagCount[] {
  const counts = new Map<string, number>();
  for (const discount of shelf.discounts) {
    for (const tag of discount.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }

  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function matchesSearch(discount: Discount, query: string): boolean {
  return query === "" || normalise(discount.title).includes(query);
}

function matchesTags(discount: Discount, tags: readonly string[]): boolean {
  return tags.every((tag) => discount.tags.includes(tag));
}

function matchesPrice(discount: Discount, maxPrice: number | null): boolean {
  return maxPrice === null || discount.finalPrice.amount <= maxPrice;
}

function matchesDepth(discount: Discount, minDepth: number): boolean {
  return discount.depth >= minDepth;
}

function matchesPlatforms(
  discount: Discount,
  platforms: readonly Platform[],
): boolean {
  return platforms.every((platform) => discount.platforms[platform]);
}

/**
 * Folds a title or a query down to what a person typing at speed means by it.
 *
 * Case and accents both go: "Öoo" is unreachable from a US keyboard otherwise,
 * and a search box that cannot find a game whose capsule is on screen reads as
 * broken rather than as strict.
 */
function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
