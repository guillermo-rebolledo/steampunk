import { describe, expect, it } from "vitest";

import { discount } from "@/lib/shelf/discount-fixture";
import {
  UNFILTERED,
  activeFilterCount,
  filterShelf,
  isClearable,
  tagsOnShelf,
} from "@/lib/shelf/filter";
import type { Shelf } from "@/lib/shelf/types";

const HOLLOW = discount({
  appId: 367520,
  title: "Hollow Knight",
  depth: 50,
  originalPrice: { amount: 1499, label: "$14.99" },
  finalPrice: { amount: 749, label: "$7.49" },
  platforms: { windows: true, mac: true, linux: true },
  tags: ["Metroidvania", "Action", "2D"],
});

const OOO = discount({
  appId: 2721890,
  title: "Öoo",
  depth: 30,
  originalPrice: { amount: 999, label: "$9.99" },
  finalPrice: { amount: 699, label: "$6.99" },
  platforms: { windows: true, mac: false, linux: false },
  tags: ["Puzzle Platformer", "2D", "Cute"],
});

const DISCO = discount({
  appId: 632470,
  title: "Disco Elysium",
  depth: 80,
  originalPrice: { amount: 3999, label: "$39.99" },
  finalPrice: { amount: 799, label: "$7.99" },
  platforms: { windows: true, mac: true, linux: false },
  tags: ["RPG", "Story Rich", "Detective"],
});

const FACTORIO = discount({
  appId: 427520,
  title: "Factorio",
  depth: 10,
  originalPrice: { amount: 3500, label: "$35.00" },
  finalPrice: { amount: 3150, label: "$31.50" },
  platforms: { windows: true, mac: true, linux: true },
  tags: ["Automation", "Strategy", "2D"],
});

/**
 * A fixture Shelf, small enough to reason about by hand.
 *
 * `totalRankable` is deliberately far larger than the four Discounts on it —
 * that gap is the honesty the interface has to carry, and filtering must not
 * quietly close it.
 */
const SHELF: Shelf = {
  discounts: [HOLLOW, OOO, DISCO, FACTORIO],
  totalRankable: 4651,
};

/** The titles a filtered Shelf holds, in Shelf order. */
function titles(shelf: Shelf): string[] {
  return shelf.discounts.map((d) => d.title);
}

describe("filterShelf", () => {
  it("returns the whole Shelf when nothing is filtered", () => {
    expect(filterShelf(SHELF, UNFILTERED)).toEqual(SHELF);
  });

  it("keeps the Shelf's own order rather than reranking what survives", () => {
    const narrowed = filterShelf(SHELF, { ...UNFILTERED, tags: ["2D"] });

    expect(titles(narrowed)).toEqual(["Hollow Knight", "Öoo", "Factorio"]);
  });

  it("keeps totalRankable — a filtered Shelf is still a sample of Steam", () => {
    const narrowed = filterShelf(SHELF, { ...UNFILTERED, search: "hollow" });

    expect(narrowed.discounts).toHaveLength(1);
    expect(narrowed.totalRankable).toBe(4651);
  });

  it("does not mutate the Shelf it is given", () => {
    const before = structuredClone(SHELF);

    filterShelf(SHELF, { ...UNFILTERED, tags: ["RPG"], maxPrice: 500 });

    expect(SHELF).toEqual(before);
  });

  describe("one filter at a time", () => {
    it("filters by tag", () => {
      const narrowed = filterShelf(SHELF, { ...UNFILTERED, tags: ["RPG"] });

      expect(titles(narrowed)).toEqual(["Disco Elysium"]);
    });

    it("requires every selected tag, so combining tags narrows", () => {
      expect(titles(filterShelf(SHELF, { ...UNFILTERED, tags: ["2D"] }))).toEqual([
        "Hollow Knight",
        "Öoo",
        "Factorio",
      ]);
      expect(
        titles(filterShelf(SHELF, { ...UNFILTERED, tags: ["2D", "Action"] })),
      ).toEqual(["Hollow Knight"]);
    });

    it("filters by maximum price, inclusively, on the price actually paid", () => {
      const narrowed = filterShelf(SHELF, { ...UNFILTERED, maxPrice: 799 });

      expect(titles(narrowed)).toEqual(["Hollow Knight", "Öoo", "Disco Elysium"]);
    });

    it("filters by minimum Discount depth, inclusively", () => {
      const narrowed = filterShelf(SHELF, { ...UNFILTERED, minDepth: 50 });

      expect(titles(narrowed)).toEqual(["Hollow Knight", "Disco Elysium"]);
    });

    it("filters by platform support", () => {
      const narrowed = filterShelf(SHELF, {
        ...UNFILTERED,
        platforms: ["linux"],
      });

      expect(titles(narrowed)).toEqual(["Hollow Knight", "Factorio"]);
    });

    it("requires every selected platform — you have one machine", () => {
      const narrowed = filterShelf(SHELF, {
        ...UNFILTERED,
        platforms: ["mac", "linux"],
      });

      expect(titles(narrowed)).toEqual(["Hollow Knight", "Factorio"]);
    });
  });

  describe("searching by name", () => {
    it("matches part of a title", () => {
      expect(
        titles(filterShelf(SHELF, { ...UNFILTERED, search: "knight" })),
      ).toEqual(["Hollow Knight"]);
    });

    it("ignores case", () => {
      expect(
        titles(filterShelf(SHELF, { ...UNFILTERED, search: "DISCO" })),
      ).toEqual(["Disco Elysium"]);
    });

    it("ignores accents, so a title nobody can type is still reachable", () => {
      expect(titles(filterShelf(SHELF, { ...UNFILTERED, search: "ooo" }))).toEqual(
        ["Öoo"],
      );
    });

    it("ignores surrounding whitespace", () => {
      expect(
        titles(filterShelf(SHELF, { ...UNFILTERED, search: "  factorio " })),
      ).toEqual(["Factorio"]);
    });

    it("treats a blank search as no search at all", () => {
      expect(filterShelf(SHELF, { ...UNFILTERED, search: "   " })).toEqual(SHELF);
    });

    it("searches names, not tags — a tag filter is the tool for tags", () => {
      expect(
        titles(filterShelf(SHELF, { ...UNFILTERED, search: "metroidvania" })),
      ).toEqual([]);
    });
  });

  describe("combining filters", () => {
    it("narrows cumulatively", () => {
      const narrowed = filterShelf(SHELF, {
        ...UNFILTERED,
        tags: ["2D"],
        maxPrice: 3200,
        minDepth: 20,
        platforms: ["windows"],
      });

      expect(titles(narrowed)).toEqual(["Hollow Knight", "Öoo"]);
    });

    it("composes search with the rest", () => {
      const narrowed = filterShelf(SHELF, {
        ...UNFILTERED,
        tags: ["2D"],
        search: "o",
      });

      expect(titles(narrowed)).toEqual(["Hollow Knight", "Öoo", "Factorio"]);
    });
  });

  describe("when nothing matches", () => {
    it("returns an empty Shelf rather than the unfiltered one", () => {
      const narrowed = filterShelf(SHELF, {
        ...UNFILTERED,
        tags: ["RPG"],
        maxPrice: 100,
      });

      expect(narrowed.discounts).toEqual([]);
      expect(narrowed.totalRankable).toBe(4651);
    });

    it("returns empty for a tag no Discount on the Shelf carries", () => {
      const narrowed = filterShelf(SHELF, {
        ...UNFILTERED,
        tags: ["Farming Sim"],
      });

      expect(narrowed.discounts).toEqual([]);
    });
  });
});

describe("activeFilterCount", () => {
  it("is zero for the unfiltered Shelf", () => {
    expect(activeFilterCount(UNFILTERED)).toBe(0);
  });

  it("is zero for a search of nothing but whitespace", () => {
    expect(activeFilterCount({ ...UNFILTERED, search: "  " })).toBe(0);
  });

  it.each([
    ["a search", { search: "knight" }],
    ["a tag", { tags: ["RPG"] }],
    ["a maximum price", { maxPrice: 500 }],
    ["a minimum depth", { minDepth: 50 }],
    ["a platform", { platforms: ["linux"] as const }],
  ])("counts %s as one", (_, applied) => {
    expect(activeFilterCount({ ...UNFILTERED, ...applied })).toBe(1);
  });

  it("counts each tag and each platform separately", () => {
    expect(
      activeFilterCount({
        ...UNFILTERED,
        tags: ["2D", "Action"],
        platforms: ["mac", "linux"],
      }),
    ).toBe(4);
  });

  it("counts a search, a price ceiling and a depth floor as one each", () => {
    expect(
      activeFilterCount({
        ...UNFILTERED,
        search: "knight",
        maxPrice: 500,
        minDepth: 50,
      }),
    ).toBe(3);
  });
});

describe("isClearable", () => {
  it("is false for the unfiltered Shelf", () => {
    expect(isClearable(UNFILTERED)).toBe(false);
  });

  it("is true for a search of nothing but whitespace, which narrows nothing", () => {
    const blank = { ...UNFILTERED, search: "  " };

    expect(activeFilterCount(blank)).toBe(0);
    // The box still has something in it, and clearing has to empty it.
    expect(isClearable(blank)).toBe(true);
  });

  it("is true whenever a filter is doing something", () => {
    expect(isClearable({ ...UNFILTERED, minDepth: 50 })).toBe(true);
  });
});

describe("tagsOnShelf", () => {
  it("counts each tag across the Shelf, commonest first", () => {
    expect(tagsOnShelf(SHELF).slice(0, 2)).toEqual([
      { name: "2D", count: 3 },
      { name: "Action", count: 1 },
    ]);
  });

  it("breaks ties alphabetically, so the list does not reshuffle", () => {
    const names = tagsOnShelf(SHELF).map((tag) => tag.name);

    expect(names).toEqual([
      "2D",
      "Action",
      "Automation",
      "Cute",
      "Detective",
      "Metroidvania",
      "Puzzle Platformer",
      "RPG",
      "Story Rich",
      "Strategy",
    ]);
  });

  it("offers only tags the Shelf actually has, and nothing when it has none", () => {
    expect(tagsOnShelf({ discounts: [], totalRankable: 4651 })).toEqual([]);
  });

  it("counts Discounts rather than tag entries, whatever it is handed", () => {
    // A Discount whose tags repeat is not something the parser produces, but
    // a count that outran the number of Discounts would be a visible lie.
    const twice = discount({ title: "Twice", tags: ["2D", "2D"] });

    expect(tagsOnShelf({ discounts: [twice], totalRankable: 4651 })).toEqual([
      { name: "2D", count: 1 },
    ]);
  });

  it("counts as a facet when handed an already-narrowed Shelf", () => {
    // What the interface hands it: the Shelf as every filter *except* tags
    // has left it. The counts are then what picking a tag would actually
    // yield, rather than what the whole Shelf holds.
    const underEight = filterShelf(SHELF, { ...UNFILTERED, maxPrice: 799 });

    expect(tagsOnShelf(underEight)).toContainEqual({ name: "2D", count: 2 });
    expect(tagsOnShelf(underEight).map((tag) => tag.name)).not.toContain(
      "Automation",
    );
  });
});
