import { describe, expect, it } from "vitest";

import { discount } from "@/lib/shelf/discount-fixture";
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

/** Titles stand in for whole Discounts, so an expected order reads as one. */
function titlesOf(shelf: Shelf): string[] {
  return shelf.discounts.map((discount) => discount.title);
}

const everyOrder: readonly SortOrder[] = SORT_ORDERS;

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

    it("sends a date shaped right but numbered wrong to the end too", () => {
      // Steam serves real dates, but the markup carries no guarantee
      // (ADR-0004) and a day of 99 would otherwise land inside February.
      const shelf = shelfOf(
        discount({ title: "Impossible day", releasedOn: "Feb 99, 2025" }),
        discount({ title: "Older", releasedOn: "Jan 15, 2025" }),
        discount({ title: "Newer", releasedOn: "Mar 1, 2025" }),
      );

      expect(titlesOf(sortShelf(shelf, "released"))).toEqual([
        "Newer",
        "Older",
        "Impossible day",
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

  it("offers exactly the four orderings the ticket asks for", () => {
    expect(SORT_ORDERS).toEqual(["depth", "price", "reviews", "released"]);
  });
});
