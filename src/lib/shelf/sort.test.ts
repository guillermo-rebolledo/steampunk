import { describe, expect, it } from "vitest";

import { SORT_ORDERS, sortShelf, type SortOrder } from "@/lib/shelf/sort";
import type { Discount, Shelf } from "@/lib/shelf/types";

/**
 * A fixture Shelf, built by hand rather than fetched. Sorting is a pure
 * function over a Shelf (ADR-0003), so nothing here goes near a fetcher, a
 * captured payload or the parser.
 */
function shelfOf(...discounts: Discount[]): Shelf {
  return { discounts, totalRankable: 4651 };
}

function discount(overrides: Partial<Discount> & { title: string }): Discount {
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
    ...overrides,
  };
}

/** The order the Shelf came off Steam in, so a test can say "unchanged". */
const titlesOf = (shelf: Shelf) => shelf.discounts.map((d) => d.title);

const everyOrder = SORT_ORDERS.map((order): SortOrder => order.value);

describe("sortShelf", () => {
  describe("by discount depth", () => {
    it("puts the steepest cut first — the ordering Steam refuses to serve", () => {
      const shelf = shelfOf(
        discount({ title: "Middling", depth: 40 }),
        discount({ title: "Steepest", depth: 90 }),
        discount({ title: "Shallowest", depth: 10 }),
      );

      expect(titlesOf(sortShelf(shelf, "depth"))).toEqual([
        "Steepest",
        "Middling",
        "Shallowest",
      ]);
    });

    it("ranks by depth and not by how little is left to pay", () => {
      // 90% off a $60 game leaves more on the counter than 40% off a $5 one.
      // Discount depth and final price are different axes (CONTEXT.md).
      const shelf = shelfOf(
        discount({
          title: "Cheap and shallow",
          depth: 40,
          finalPrice: { amount: 300, label: "$3.00" },
        }),
        discount({
          title: "Dear and deep",
          depth: 90,
          finalPrice: { amount: 600, label: "$6.00" },
        }),
      );

      expect(titlesOf(sortShelf(shelf, "depth"))).toEqual([
        "Dear and deep",
        "Cheap and shallow",
      ]);
    });
  });

  describe("by final price", () => {
    it("puts the cheapest first, comparing integers rather than labels", () => {
      // Compared as strings, "$9.99" sorts after "$10.00" and "$100.00"
      // before both.
      const shelf = shelfOf(
        discount({
          title: "Ten",
          finalPrice: { amount: 1000, label: "$10.00" },
        }),
        discount({
          title: "Hundred",
          finalPrice: { amount: 10000, label: "$100.00" },
        }),
        discount({
          title: "Nine",
          finalPrice: { amount: 999, label: "$9.99" },
        }),
      );

      expect(titlesOf(sortShelf(shelf, "price"))).toEqual([
        "Nine",
        "Ten",
        "Hundred",
      ]);
    });
  });

  describe("by review score", () => {
    it("puts the best regarded first", () => {
      const shelf = shelfOf(
        discount({
          title: "Very Positive",
          reviews: {
            summary: "Very Positive",
            positivePercent: 85,
            count: 500,
          },
        }),
        discount({
          title: "Overwhelmingly Positive",
          reviews: {
            summary: "Overwhelmingly Positive",
            positivePercent: 99,
            count: 500,
          },
        }),
      );

      expect(titlesOf(sortShelf(shelf, "reviews"))).toEqual([
        "Overwhelmingly Positive",
        "Very Positive",
      ]);
    });

    it("breaks an equal percentage with the number of reviews behind it", () => {
      // 96% of 40,000 is a stronger claim than 96% of 40.
      const shelf = shelfOf(
        discount({
          title: "Few",
          reviews: { summary: "Very Positive", positivePercent: 96, count: 40 },
        }),
        discount({
          title: "Many",
          reviews: {
            summary: "Very Positive",
            positivePercent: 96,
            count: 40_000,
          },
        }),
      );

      expect(titlesOf(sortShelf(shelf, "reviews"))).toEqual(["Many", "Few"]);
    });
  });

  describe("by release date", () => {
    it("puts the newest first, reading Steam's own date format", () => {
      const shelf = shelfOf(
        discount({ title: "Older", releasedOn: "Nov 27, 2007" }),
        discount({ title: "Newest", releasedOn: "Aug 7, 2025" }),
        discount({ title: "Middling", releasedOn: "Oct 12, 2012" }),
      );

      expect(titlesOf(sortShelf(shelf, "released"))).toEqual([
        "Newest",
        "Middling",
        "Older",
      ]);
    });

    it("orders within a year and within a month, not alphabetically", () => {
      // "Dec" precedes "Nov" alphabetically, and "Aug 7" precedes "Aug 13".
      const shelf = shelfOf(
        discount({ title: "Aug 7", releasedOn: "Aug 7, 2025" }),
        discount({ title: "Dec 4", releasedOn: "Dec 4, 2025" }),
        discount({ title: "Aug 13", releasedOn: "Aug 13, 2025" }),
        discount({ title: "Nov 15", releasedOn: "Nov 15, 2025" }),
      );

      expect(titlesOf(sortShelf(shelf, "released"))).toEqual([
        "Dec 4",
        "Nov 15",
        "Aug 13",
        "Aug 7",
      ]);
    });

    it("sends a date it cannot read to the end rather than guessing at one", () => {
      const shelf = shelfOf(
        discount({ title: "Unreadable", releasedOn: "Coming soon" }),
        discount({ title: "Missing", releasedOn: "" }),
        discount({ title: "Old", releasedOn: "Sep 4, 2008" }),
        discount({ title: "New", releasedOn: "Jan 15, 2025" }),
      );

      expect(titlesOf(sortShelf(shelf, "released"))).toEqual([
        "New",
        "Old",
        // Kept in the Shelf's own order among themselves.
        "Unreadable",
        "Missing",
      ]);
    });
  });

  describe("ties", () => {
    it.each(everyOrder)(
      "keeps the Shelf's own order when %s cannot separate two Discounts",
      (order) => {
        const tied = [
          discount({ title: "First off Steam" }),
          discount({ title: "Second off Steam" }),
          discount({ title: "Third off Steam" }),
        ];

        expect(titlesOf(sortShelf(shelfOf(...tied), order))).toEqual(
          tied.map((d) => d.title),
        );
      },
    );

    it.each(everyOrder)(
      "orders identically however many times %s is applied",
      (order) => {
        const shelf = shelfOf(
          discount({ title: "A", depth: 75 }),
          discount({ title: "B", depth: 30 }),
          discount({ title: "C", depth: 75 }),
          discount({ title: "D", depth: 30 }),
        );

        const once = sortShelf(shelf, order);
        expect(titlesOf(sortShelf(once, order))).toEqual(titlesOf(once));
      },
    );
  });

  describe("whatever the order", () => {
    const shelf = shelfOf(
      discount({ title: "A", depth: 75, releasedOn: "Mar 6, 2007" }),
      discount({ title: "B", depth: 30, releasedOn: "" }),
      discount({ title: "C", depth: 90, releasedOn: "Jun 11, 2026" }),
    );

    it.each(everyOrder)(
      "%s leaves the Shelf it was handed untouched",
      (order) => {
        const before = titlesOf(shelf);

        sortShelf(shelf, order);

        expect(titlesOf(shelf)).toEqual(before);
      },
    );

    it.each(everyOrder)(
      "%s holds on to every Discount and drops none",
      (order) => {
        const sorted = sortShelf(shelf, order);

        expect([...titlesOf(sorted)].sort()).toEqual(
          [...titlesOf(shelf)].sort(),
        );
      },
    );

    it.each(everyOrder)(
      "%s carries the rest of the Shelf across unchanged",
      (order) => {
        expect(sortShelf(shelf, order).totalRankable).toBe(shelf.totalRankable);
      },
    );
  });

  it("offers exactly the four orderings the interface names", () => {
    expect(SORT_ORDERS.map((order) => order.value)).toEqual([
      "depth",
      "price",
      "reviews",
      "released",
    ]);
    for (const order of SORT_ORDERS) {
      expect(order.label).not.toBe("");
      expect(order.hint).not.toBe("");
    }
  });
});
