import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import type { Fetcher } from "@/lib/shelf/fetcher";
import { fetchShelf } from "@/lib/shelf/shelf";

/**
 * A real capture of Steam's store search, taken 2026-08-19 with
 * `specials=1&infinite=1&sort_by=Reviews_DESC&count=100&cc=us&l=english`.
 * Recapture it by running that request and saving the response body verbatim.
 */
const capturedPayload = readFileSync(
  new URL("./fixtures/store-search.json", import.meta.url),
  "utf8",
);

/** A fetcher that replays a payload and records what it was asked for. */
function replaying(payload: string) {
  const urls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    urls.push(url);
    return new Response(payload, {
      headers: { "content-type": "application/json" },
    });
  };
  return { fetcher, urls };
}

/** Rewrites the captured payload's `results_html`, keeping the envelope real. */
function withRows(rows: string) {
  const envelope = JSON.parse(capturedPayload) as { results_html: string };
  return JSON.stringify({ ...envelope, results_html: rows });
}

/** Pulls whole `<a class="search_result_row">` blocks out of the capture. */
function capturedRows(): string[] {
  const html = (JSON.parse(capturedPayload) as { results_html: string })
    .results_html;
  return html
    .split(/(?=<a href="https:\/\/store\.steampowered\.com\/)/)
    .slice(1);
}

describe("fetchShelf", () => {
  it("asks Steam for one page of Rankable Discounts", async () => {
    const { fetcher, urls } = replaying(capturedPayload);

    await fetchShelf({ fetcher });

    expect(urls).toHaveLength(1);
    const url = new URL(urls[0]);
    expect(url.origin + url.pathname).toBe(
      "https://store.steampowered.com/search/results",
    );
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      specials: "1",
      infinite: "1",
      // Reviews_DESC is one of the three sorts Steam actually honours — a
      // discount sort is silently ignored. See ADR-0001.
      sort_by: "Reviews_DESC",
      count: "100",
      start: "0",
    });
  });

  it("builds a Shelf of Discounts from the captured payload", async () => {
    const { fetcher } = replaying(capturedPayload);

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts).toHaveLength(100);
    expect(shelf.totalRankable).toBe(4651);
  });

  it("reads every field a card needs off a row", async () => {
    const { fetcher } = replaying(capturedPayload);

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts[0]).toEqual({
      appId: 2721890,
      title: "Öoo",
      capsuleUrl:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2721890/b451cb4d7bc0866f723f95c6525bc68a31097944/capsule_231x87.jpg?t=1782905493",
      storeUrl: "https://store.steampowered.com/app/2721890/Ooo/",
      depth: 30,
      originalPrice: { amount: 999, label: "$9.99" },
      finalPrice: { amount: 699, label: "$6.99" },
      reviews: {
        summary: "Overwhelmingly Positive",
        positivePercent: 99,
        count: 2099,
      },
      platforms: { windows: true, mac: false, linux: false },
      releasedOn: "Aug 7, 2025",
    });
  });

  it("keeps Steam's review ranking rather than reordering the Shelf", async () => {
    const { fetcher } = replaying(capturedPayload);

    const shelf = await fetchShelf({ fetcher });

    const summaries = new Set(shelf.discounts.map((d) => d.reviews.summary));
    expect([...summaries]).toEqual([
      "Overwhelmingly Positive",
      "Very Positive",
    ]);
    expect(shelf.discounts.map((d) => d.title).slice(0, 3)).toEqual([
      "Öoo",
      "Strange Jigsaws",
      "A Castle Full of Cats",
    ]);
  });

  it("holds prices as integers for comparison and strings for display", async () => {
    const { fetcher } = replaying(capturedPayload);

    const shelf = await fetchShelf({ fetcher });

    for (const discount of shelf.discounts) {
      expect(Number.isInteger(discount.finalPrice.amount)).toBe(true);
      expect(Number.isInteger(discount.originalPrice.amount)).toBe(true);
      expect(discount.finalPrice.amount).toBeLessThan(
        discount.originalPrice.amount,
      );
      expect(discount.finalPrice.label).toMatch(/^\$/);
    }

    const cheapest = [...shelf.discounts].sort(
      (a, b) => a.finalPrice.amount - b.finalPrice.amount,
    )[0];
    expect(cheapest.finalPrice.label).toBe("$0.52");
  });

  it("reads multi-platform support and packages that cover several apps", async () => {
    const { fetcher } = replaying(capturedPayload);

    const shelf = await fetchShelf({ fetcher });

    // A `/sub/` row: its `data-ds-appid` lists every app in the package, and
    // its link goes to the package rather than to any one game.
    const pack = shelf.discounts.find((d) => d.title.startsWith("Total War"));
    expect(pack).toMatchObject({
      appId: 4700,
      storeUrl: "https://store.steampowered.com/sub/460/",
      platforms: { windows: true, mac: true, linux: true },
    });
  });

  describe("when a row is malformed", () => {
    const [good, second, third] = capturedRows();

    it("skips a row with no app id and keeps the rest of the Shelf", async () => {
      const { fetcher } = replaying(
        withRows(good + second.replace(/data-ds-appid="[^"]*"/, "")),
      );

      const shelf = await fetchShelf({ fetcher });

      expect(shelf.discounts.map((d) => d.appId)).toEqual([2721890]);
    });

    // Steam prices a row in three places, and a row can lose any of them.
    it.each([
      [
        "the whole discount block",
        /<div class="discount_block[\s\S]*?<\/div><\/div><\/div>/,
      ],
      ["Steam's own price integer", / data-price-final="\d+"/g],
      [
        "the displayed prices",
        /<div class="discount_prices">[\s\S]*?<\/div><\/div>/,
      ],
    ])(
      "skips a row missing %s and keeps the rest of the Shelf",
      async (_, gone) => {
        const { fetcher } = replaying(withRows(good + third.replace(gone, "")));

        const shelf = await fetchShelf({ fetcher });

        expect(shelf.discounts.map((d) => d.appId)).toEqual([2721890]);
      },
    );

    // A card cannot be drawn without these either, so they drop the row too.
    it.each([
      ["a title", /<span class="title">[\s\S]*?<\/span>/],
      ["capsule art", /<div class="search_capsule">[\s\S]*?<\/div>/],
    ])(
      "skips a row missing %s and keeps the rest of the Shelf",
      async (_, gone) => {
        const { fetcher } = replaying(withRows(good + third.replace(gone, "")));

        const shelf = await fetchShelf({ fetcher });

        expect(shelf.discounts.map((d) => d.appId)).toEqual([2721890]);
      },
    );

    it("skips a row Steam has not scored — the Shelf is Rankable by construction", async () => {
      const { fetcher } = replaying(
        withRows(
          good +
            second.replace(
              /<span class="search_review_summary[\s\S]*?><\/span>/,
              "",
            ),
        ),
      );

      const shelf = await fetchShelf({ fetcher });

      expect(shelf.discounts.map((d) => d.appId)).toEqual([2721890]);
    });

    it("lets no exception escape, even on markup that is not Steam's", async () => {
      const { fetcher } = replaying(
        withRows(
          good +
            // A row whose shape Steam has changed out from under us: the class
            // is still there, so it is selected, but nothing inside it is.
            '<a class="search_result_row" href="not-a-url" data-ds-appid="???">' +
            '<div class="discount_block" data-discount="lots"></div></a>' +
            // And the same row truncated mid-attribute.
            second.slice(0, 420),
        ),
      );

      await expect(fetchShelf({ fetcher })).resolves.toEqual({
        discounts: [expect.objectContaining({ appId: 2721890 })],
        totalRankable: 4651,
      });
    });
  });
});
