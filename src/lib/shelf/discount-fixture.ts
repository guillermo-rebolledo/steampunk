import type { Discount } from "@/lib/shelf/types";

/**
 * A Discount built by hand, for the tests of the pure functions over a Shelf.
 *
 * Sorting and filtering are pure functions of a Shelf (ADR-0003), so their
 * tests go nowhere near a fetcher, a captured payload or the parser — they
 * need Discounts, not Steam. Only the fields a test is actually about get
 * overridden, so what each test cares about is what it names.
 *
 * The Steam-shaped counterpart, for the parser and Shelf assembly, is
 * `steam-test-double.ts`.
 */
export function discount(
  overrides: Partial<Discount> & { title: string },
): Discount {
  return {
    appId: 1,
    capsuleUrl: "https://example.invalid/capsule.jpg",
    storeUrl: `https://store.steampowered.com/app/1/${overrides.title}/`,
    depth: 50,
    originalPrice: { amount: 2000, label: "$20.00" },
    finalPrice: { amount: 1000, label: "$10.00" },
    reviews: { summary: "Very Positive", positivePercent: 85, count: 500 },
    platforms: { windows: true, mac: false, linux: false },
    releasedOn: "Nov 9, 2022",
    tags: [],
    ...overrides,
  };
}
