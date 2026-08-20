import type { Discount, Shelf } from "@/lib/shelf/types";

/**
 * Reordering the Shelf.
 *
 * Sorting is a pure function over an already-loaded Shelf — Shelf in, Shelf
 * out, no I/O, no seam, no refetch (ADR-0003). Discount depth is the headline
 * ordering: Steam silently ignores a discount sort parameter (ADR-0001), so
 * offering it over a quality-filtered Shelf is a large part of why this app
 * exists.
 *
 * Each ordering has one natural direction and no toggle. "Cheapest first" is
 * the question a visitor asks; "most expensive first" is not, and a direction
 * toggle would double the states in the interface to serve nobody.
 */
export const SORT_ORDERS = [
  {
    value: "depth",
    label: "Discount depth",
    hint: "Steepest cut first",
  },
  {
    value: "price",
    label: "Price",
    hint: "Cheapest first",
  },
  {
    value: "reviews",
    label: "Review score",
    hint: "Best regarded first",
  },
  {
    value: "released",
    label: "Release date",
    hint: "Newest first",
  },
] as const;

export type SortOrder = (typeof SORT_ORDERS)[number]["value"];

/** How two Discounts compare: negative puts `a` first, 0 leaves them tied. */
type Comparator = (a: Discount, b: Discount) => number;

const COMPARATORS: Record<SortOrder, Comparator> = {
  // Depth, not final price. 100% off a free game and 75% off a $60 one are
  // different propositions, and ranking by one is not ranking by the other.
  depth: (a, b) => b.depth - a.depth,
  // Steam's integer in minor units, never the label: compared as strings,
  // "$100.00" sorts before "$9.99".
  price: (a, b) => a.finalPrice.amount - b.finalPrice.amount,
  reviews: (a, b) =>
    b.reviews.positivePercent - a.reviews.positivePercent ||
    // 96% of 40,000 reviews is a stronger claim than 96% of 40, so the count
    // separates games the percentage cannot.
    b.reviews.count - a.reviews.count,
  released: (a, b) => {
    const left = releaseKey(a.releasedOn);
    const right = releaseKey(b.releasedOn);
    // Written out rather than leaning on arithmetic, because subtracting two
    // sentinels for "no date" would give NaN and quietly tie every pair.
    if (left === null || right === null) {
      return (left === null ? 1 : 0) - (right === null ? 1 : 0);
    }
    return right - left;
  },
};

/**
 * Reorders the Shelf, leaving the one it was handed untouched.
 *
 * Ties keep the Shelf's own order, which is Steam's review ranking — so among
 * equally deep cuts the better-reviewed game comes first, and so equal values
 * never reshuffle between renders. `Array.prototype.sort` has been stable by
 * specification since ES2019; the comparators return 0 on a tie and lean on
 * it deliberately.
 */
export function sortShelf(shelf: Shelf, order: SortOrder): Shelf {
  return {
    ...shelf,
    discounts: [...shelf.discounts].sort(COMPARATORS[order]),
  };
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Turns Steam's `Aug 7, 2025` into a number that sorts like a date.
 *
 * Deliberately not `new Date()`: this compares dates rather than instants, and
 * a parsed date would carry a timezone that could shift a release across a day
 * boundary depending on where the render happens.
 *
 * Steam serves an exact date for anything discounted, but the markup carries no
 * compatibility guarantee (ADR-0004) and the parser leaves the field empty when
 * a row has none. Anything this cannot read sorts to the end — under "newest
 * first" an unknown date belongs last, and guessing at one would silently
 * misplace a game among real dates.
 */
function releaseKey(releasedOn: string): number | null {
  const parts = /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec(
    releasedOn.trim(),
  );
  if (parts === null) return null;

  const month = MONTHS.indexOf(parts[1]);
  if (month === -1) return null;

  return Number(parts[3]) * 10_000 + (month + 1) * 100 + Number(parts[2]);
}
