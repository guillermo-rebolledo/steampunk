import { describe, expect, it } from "vitest";

import type { Fetcher } from "@/lib/shelf/fetcher";
import { fetchShelf, PAGE_SIZE } from "@/lib/shelf/shelf";
import {
  capturedPage,
  capturedRows,
  jsonResponse,
  replayingRows,
  replayingSteam,
  startOf,
} from "@/lib/shelf/steam-test-double";

describe("fetchShelf", () => {
  it("asks Steam for five pages of Rankable Discounts and no more", async () => {
    const { fetcher, calls } = replayingSteam();

    await fetchShelf({ fetcher });

    // Five is the ceiling, not a starting point: ~20 requests in a short
    // window trip a 429 that then holds for ~31s no matter how politely you
    // pace afterwards (ADR-0004).
    expect(calls).toHaveLength(5);
    for (const url of calls) {
      const asked = new URL(url);
      expect(asked.origin + asked.pathname).toBe(
        "https://store.steampowered.com/search/results",
      );
      expect(Object.fromEntries(asked.searchParams)).toMatchObject({
        specials: "1",
        infinite: "1",
        // Reviews_DESC is one of the three sorts Steam actually honours — a
        // discount sort is silently ignored. See ADR-0001.
        sort_by: "Reviews_DESC",
        count: "100",
      });
    }
    expect(calls.map(startOf).sort((a, b) => a - b)).toEqual([
      0, 100, 200, 300, 400,
    ]);
  });

  it("puts all five pages in flight at once rather than walking them", async () => {
    const inFlight: number[] = [];
    let open = 0;
    const fetcher: Fetcher = async (url) => {
      open += 1;
      // Yield, so a sequential implementation would let each page settle
      // before opening the next and never record five open at once.
      await Promise.resolve();
      inFlight.push(open);
      open -= 1;
      return jsonResponse(capturedPage(startOf(url)));
    };

    await fetchShelf({ fetcher });

    expect(Math.max(...inFlight)).toBe(5);
  });

  it("builds a Shelf of ~500 Discounts from the captured pages", async () => {
    const { fetcher } = replayingSteam();

    const shelf = await fetchShelf({ fetcher });

    // Five pages of 100 rows, less three the parser drops: the capture's last
    // page carries "Sonic Generations Collection" and two Command & Conquer
    // titles with no price and no discount block at all. "~500" is the size
    // the Shelf is specified at, and rows Steam cannot price are why it is
    // approximate rather than exact.
    expect(shelf.discounts).toHaveLength(497);
    expect(shelf.totalRankable).toBe(4653);
  });

  it("keeps Steam's review ranking across the page seams", async () => {
    const { fetcher } = replayingSteam();

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts.map((d) => d.title).slice(0, 3)).toEqual([
      "Öoo",
      "Strange Jigsaws",
      "A Castle Full of Cats",
    ]);
    // The pages are stitched in ranking order, so the first Discount of the
    // second page follows the hundredth of the first rather than landing
    // wherever `Promise.all` happened to settle.
    const [firstOfPageTwo] = capturedRows(100);
    expect(shelf.discounts[PAGE_SIZE].appId).toBe(
      Number(firstOfPageTwo.match(/data-ds-appid="(\d+)/)?.[1]),
    );
    // Steam's own ranking blends review percentage with volume, so it is not
    // monotonic in either alone — which is exactly why the Shelf keeps the
    // order Steam gave rather than re-deriving one (ADR-0001).
    expect(shelf.discounts.at(-1)?.title).toBe(
      capturedRows(400)
        .at(-1)
        ?.match(/<span class="title">([^<]*)/)?.[1],
    );
  });

  it("holds a Discount once even when two pages both carry it", async () => {
    // Steam's ranking shifts between the five parallel requests, so the same
    // game can land on two pages. It is one Discount, and the Shelf holds it
    // once — a repeat would also collide as a duplicate React key.
    const fetcher: Fetcher = async () => jsonResponse(capturedPage(0));

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts).toHaveLength(100);
  });

  it("keeps two Discounts that lead with the same app id", async () => {
    const { fetcher } = replayingSteam();

    const shelf = await fetchShelf({ fetcher });

    // Deduplication keys on the store URL rather than the app id, because the
    // app id is not an identity. A `/sub/` row reports every app the package
    // covers and the Shelf takes the first, so the Total War package and the
    // single game it leads with both report 4700 while being two different
    // things to buy. Keying on the app id would silently drop one.
    const sharingAppId = shelf.discounts.filter((d) => d.appId === 4700);
    expect(sharingAppId.map((d) => d.storeUrl)).toEqual([
      "https://store.steampowered.com/sub/460/",
      "https://store.steampowered.com/app/4700/Total_War_MEDIEVAL_II__Definitive_Edition/",
    ]);
  });

  it("reads every field a card needs off a row", async () => {
    const { fetcher } = replayingSteam();

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts[0]).toEqual({
      appId: 2721890,
      title: "Öoo",
      capsuleUrl:
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/2721890/b451cb4d7bc0866f723f95c6525bc68a31097944/capsule_231x87.jpg?t=1782905493",
      storeUrl: "https://store.steampowered.com/app/2721890/Ooo/",
      depth: 30,
      originalPrice: { amount: 999, label: "$9.99" },
      finalPrice: { amount: 699, label: "$6.99" },
      reviews: {
        summary: "Overwhelmingly Positive",
        positivePercent: 99,
        count: 2100,
      },
      platforms: { windows: true, mac: false, linux: false },
      releasedOn: "Aug 7, 2025",
      tags: [
        "Puzzle Platformer",
        "2D Platformer",
        "Metroidvania",
        "Exploration",
        "Puzzle",
        "2D",
        "Cute",
      ],
    });
  });

  it("names the tag ids a row carries, in the order Steam ranks them", async () => {
    const { fetcher } = replayingSteam();

    const shelf = await fetchShelf({ fetcher });

    // Steam names a tag nowhere in the row — only `data-ds-tagids` — so the
    // names come from the vendored lookup (ADR-0005).
    const cats = shelf.discounts.find(
      (d) => d.title === "A Castle Full of Cats",
    );
    expect(cats?.tags).toEqual([
      "Cats",
      "Hidden Object",
      "Wholesome",
      "Point & Click",
      "Cozy",
      "Relaxing",
      "Puzzle",
    ]);
  });

  it("drops a tag id it has no name for rather than showing the number", async () => {
    const [good] = capturedRows();
    const fetcher: Fetcher = replayingRows(
      good.replace(
        /data-ds-tagids="[^"]*"/,
        'data-ds-tagids="[1664,99999999,3871]"',
      ),
    );

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts[0].tags).toEqual(["Puzzle", "2D"]);
  });

  it("names a repeated tag id once — a Discount's tags are a set", async () => {
    const [good] = capturedRows();
    const fetcher: Fetcher = replayingRows(
      good.replace(
        /data-ds-tagids="[^"]*"/,
        'data-ds-tagids="[1664,3871,1664]"',
      ),
    );

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts[0].tags).toEqual(["Puzzle", "2D"]);
  });

  it("leaves a row with no tag ids untagged rather than dropping it", async () => {
    const [good] = capturedRows();
    const fetcher: Fetcher = replayingRows(
      good.replace(/data-ds-tagids="[^"]*"/, 'data-ds-tagids="not json"'),
    );

    const shelf = await fetchShelf({ fetcher });

    expect(shelf.discounts).toHaveLength(1);
    expect(shelf.discounts[0].tags).toEqual([]);
  });

  it("holds prices as integers for comparison and strings for display", async () => {
    const { fetcher } = replayingSteam();

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
    expect(cheapest.finalPrice.label).toBe("$0.49");
  });

  it("reads multi-platform support and packages that cover several apps", async () => {
    const { fetcher } = replayingSteam();

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

  describe("when Steam refuses to serve a page", () => {
    // Assembly is all-or-nothing on purpose. The Shelf is the top slice of a
    // ranking; dropping the page that failed would quietly hand the visitor a
    // different, worse sample under the same name. Rejecting is what lets the
    // cache serve the last good Shelf instead — see cache.test.ts.
    it("rejects when a page is rate-limited", async () => {
      const fetcher: Fetcher = async (url) =>
        startOf(url) === 300
          ? new Response("", { status: 429, statusText: "Too Many Requests" })
          : jsonResponse(capturedPage(startOf(url)));

      await expect(fetchShelf({ fetcher })).rejects.toThrow(/429/);
    });

    it("rejects when a page is not JSON at all", async () => {
      const fetcher: Fetcher = async (url) =>
        startOf(url) === 200
          ? new Response("<html>Steam is having a moment</html>", {
              headers: { "content-type": "text/html" },
            })
          : jsonResponse(capturedPage(startOf(url)));

      await expect(fetchShelf({ fetcher })).rejects.toThrow(/unreadable/i);
    });

    it("rejects when a page carries no rows Steam still says exist", async () => {
      // Markup we do not control moving under us looks exactly like this:
      // a perfectly valid envelope whose rows yield nothing.
      const fetcher: Fetcher = async (url) =>
        startOf(url) === 400
          ? jsonResponse({
              results_html: "<div>something that is not a row</div>",
              total_count: 4653,
            })
          : jsonResponse(capturedPage(startOf(url)));

      await expect(fetchShelf({ fetcher })).rejects.toThrow(/no Discounts/);
    });

    it("rejects rather than assembling an empty Shelf", async () => {
      const fetcher: Fetcher = async () =>
        jsonResponse({ results_html: "", total_count: 0 });

      await expect(fetchShelf({ fetcher })).rejects.toThrow(/no Discounts/);
    });
  });

  describe("when a row is malformed", () => {
    const [good, second, third] = capturedRows();

    it("skips a row with no app id and keeps the rest of the Shelf", async () => {
      const fetcher: Fetcher = replayingRows(
        good + second.replace(/data-ds-appid="[^"]*"/, ""),
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
        const fetcher: Fetcher = replayingRows(good + third.replace(gone, ""));

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
        const fetcher: Fetcher = replayingRows(good + third.replace(gone, ""));

        const shelf = await fetchShelf({ fetcher });

        expect(shelf.discounts.map((d) => d.appId)).toEqual([2721890]);
      },
    );

    it("skips a row Steam has not scored — the Shelf is Rankable by construction", async () => {
      const fetcher: Fetcher = replayingRows(
        good +
          second.replace(
            /<span class="search_review_summary[\s\S]*?><\/span>/,
            "",
          ),
      );

      const shelf = await fetchShelf({ fetcher });

      expect(shelf.discounts.map((d) => d.appId)).toEqual([2721890]);
    });

    it("lets no exception escape, even on markup that is not Steam's", async () => {
      const fetcher: Fetcher = replayingRows(
        good +
          // A row whose shape Steam has changed out from under us: the class
          // is still there, so it is selected, but nothing inside it is.
          '<a class="search_result_row" href="not-a-url" data-ds-appid="???">' +
          '<div class="discount_block" data-discount="lots"></div></a>' +
          // And the same row truncated mid-attribute.
          second.slice(0, 420),
      );

      await expect(fetchShelf({ fetcher })).resolves.toEqual({
        discounts: [expect.objectContaining({ appId: 2721890 })],
        totalRankable: PAGE_SIZE,
      });
    });
  });
});
