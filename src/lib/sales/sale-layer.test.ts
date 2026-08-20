import { describe, expect, it } from "vitest";

import { activeAt, fetchSaleLayer } from "@/lib/sales/sale-layer";
import {
  SALE_ENDS,
  SALE_STARTS,
  WHILE_RUNNING,
  replayingSteamSales,
  withCategoryItems,
  withEventFields,
  withEventsBefore,
  withSpotlightSales,
  withSpotlightsRepeated,
  withoutEventRecord,
} from "@/lib/sales/sales-test-double";
import type { Sale } from "@/lib/sales/types";
import type { Fetcher } from "@/lib/shelf/fetcher";

/** The captured Sale, as the layer reads it off Steam's own event record. */
const CAPTURED_SALE: Sale = {
  id: "671748057601149156",
  // The event record names the campaign in full; the Spotlight only carries
  // the shorter label.
  name: "SEGA Publisher Sale 2026",
  label: "Publisher Sale",
  artworkUrl:
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/spotlights/f626befe105f92f286855130/d1823f50f24d766340dfb3faa1b44ec7c0b06f73/vertical_capsule_english.jpg?t=1786642500",
  url: "https://store.steampowered.com/sale/SEGAPublisherSale2026/",
  startsAt: SALE_STARTS,
  endsAt: SALE_ENDS,
};

/** The captured Daily Deal's own fields, to be spoilt one at a time. */
const A_DAILY_DEAL = {
  id: 1422440,
  name: "Cataclismo",
  header_image:
    "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1422440/header.jpg?t=1787245168",
  currency: "USD",
  original_price: 2999,
  final_price: 1499,
  discount_percent: 50,
};

describe("fetchSaleLayer", () => {
  it("asks Steam which campaigns are up, then each one for its dates", async () => {
    const { fetcher, urls } = replayingSteamSales();

    await fetchSaleLayer({ fetcher });

    expect(urls[0]).toBe(
      "https://store.steampowered.com/api/featuredcategories?cc=us&l=english",
    );
    // Only the Spotlights that point at a Sale cost a second fetch. Most
    // point at a single game and cannot carry a campaign window at all.
    expect(urls.slice(1)).toEqual([
      "https://store.steampowered.com/sale/SEGAPublisherSale2026?cc=us&l=english",
    ]);
  });

  it("reads a Sale's real window off its partner event record", async () => {
    const { fetcher } = replayingSteamSales();

    const { sales } = await fetchSaleLayer({ fetcher });

    expect(sales).toEqual([CAPTURED_SALE]);
  });

  // Which Sales are *running* is decided when a visitor is served, not here —
  // an hour-old cached layer must not have a moment in time baked into it.
  it("returns every Sale it found, running or not", async () => {
    const { fetcher } = replayingSteamSales({
      // A campaign that ran, and finished, in 2001.
      salePage: withEventFields({
        rtime32_start_time: 1000000000,
        rtime32_end_time: 1000086400,
      }),
    });

    const { sales } = await fetchSaleLayer({ fetcher });

    expect(sales).toHaveLength(1);
    expect(sales[0].endsAt).toBe(1000086400 * 1000);
  });

  // Steam promotes one campaign from several slots at once, and the same Sale
  // fetched three times would spend the cap below on one campaign and draw it
  // three times under three identical keys.
  it("asks for a Sale once, however many slots promote it", async () => {
    const { fetcher, salePageUrls } = replayingSteamSales({
      featured: withSpotlightsRepeated(9),
    });

    const { sales } = await fetchSaleLayer({ fetcher });

    expect(salePageUrls()).toHaveLength(1);
    expect(sales).toEqual([CAPTURED_SALE]);
  });

  // ADR-0004 measured Steam's limit: ~20 requests in a short window trips a
  // 429 that then persists for ~31 seconds. Shelf assembly spends five and
  // the Spotlight lookup a sixth, so the layer caps its own share at three.
  it("bounds how many Sale pages one assembly may fetch", async () => {
    const { fetcher, salePageUrls } = replayingSteamSales({
      featured: withSpotlightSales(["one", "two", "three", "four", "five"]),
    });

    await fetchSaleLayer({ fetcher });

    expect(salePageUrls()).toEqual([
      "https://store.steampowered.com/sale/one?cc=us&l=english",
      "https://store.steampowered.com/sale/two?cc=us&l=english",
      "https://store.steampowered.com/sale/three?cc=us&l=english",
    ]);
  });

  it("reads the Daily Deal's depth and prices", async () => {
    const { fetcher } = replayingSteamSales();

    const { dailyDeal } = await fetchSaleLayer({ fetcher });

    expect(dailyDeal).toEqual({
      appId: 1422440,
      title: "Cataclismo",
      headerUrl:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1422440/header.jpg?t=1787245168",
      storeUrl: "https://store.steampowered.com/app/1422440/",
      depth: 50,
      // This endpoint gives integers and a currency code but no display
      // string, so the label is built from them.
      originalPrice: { amount: 2999, label: "$29.99" },
      finalPrice: { amount: 1499, label: "$14.99" },
    });
  });

  describe("when Steam does not cooperate", () => {
    // Rejecting rather than returning nothing is the point: the cache above
    // has to be able to tell "Steam is blocking us" from "Steam is promoting
    // nothing", or a 429 would wipe a good layer for an hour.
    it.each([
      ["it is rate limited", 429],
      ["it fails outright", 500],
    ])("rejects when the Spotlight lookup says %s", async (_, status) => {
      const { fetcher } = replayingSteamSales({ featured: status });

      await expect(fetchSaleLayer({ fetcher })).rejects.toThrow(
        /would not say which campaigns are up/,
      );
    });

    it.each([
      ["an outage page", "<!DOCTYPE html><html>Steam is down</html>"],
      ["an empty body", ""],
    ])("rejects when the Spotlight lookup answers with %s", async (_, body) => {
      const { fetcher } = replayingSteamSales({ featured: body });

      await expect(fetchSaleLayer({ fetcher })).rejects.toThrow(/not JSON/);
    });

    it("rejects when the fetcher rejects outright", async () => {
      const fetcher: Fetcher = async () => {
        throw new Error("getaddrinfo ENOTFOUND store.steampowered.com");
      };

      await expect(fetchSaleLayer({ fetcher })).rejects.toThrow(
        /would not say which campaigns are up/,
      );
    });

    // Valid JSON is taken at its word: Steam is entitled to promote nothing,
    // and an empty layer is a real answer rather than a failure.
    it("serves an empty layer when Steam names no campaigns", async () => {
      const { fetcher } = replayingSteamSales({ featured: '{"status":1}' });

      await expect(fetchSaleLayer({ fetcher })).resolves.toEqual({
        sales: [],
        dailyDeal: null,
      });
    });

    // The payload is untrusted `unknown` all the way down, and a reader that
    // goes straight for a field would take the whole layer with it rather than
    // the one malformed slot.
    it.each([
      ["null", null],
      ["a bare string", "cat_spotlight"],
      ["a number", 7],
      ["an object with nothing in it", {}],
    ])("drops a Spotlight slot that is %s", async (_, slot) => {
      const { fetcher } = replayingSteamSales({
        featured: withCategoryItems("cat_spotlight", [slot]),
      });

      const { sales } = await fetchSaleLayer({ fetcher });

      expect(sales).toEqual([]);
    });

    it.each([
      ["is null", null],
      // Depth is a whole percentage; anything outside 1-100 is not one.
      ["claims a depth above 100", { ...A_DAILY_DEAL, discount_percent: 150 }],
      ["claims a depth of zero", { ...A_DAILY_DEAL, discount_percent: 0 }],
      // "-$2.00, down from -$1.00" satisfies the ordering and nothing else.
      [
        "prices the game below nothing",
        { ...A_DAILY_DEAL, original_price: -100, final_price: -200 },
      ],
      // `next/image` is configured for Steam's CDN and throws on anything
      // else — where it renders, taking the page with it.
      [
        "hosts its artwork somewhere else",
        { ...A_DAILY_DEAL, header_image: "https://example.com/header.jpg" },
      ],
      [
        "serves its artwork over plain HTTP",
        {
          ...A_DAILY_DEAL,
          header_image: "http://shared.steamstatic.com/header.jpg",
        },
      ],
    ])("drops a Daily Deal that %s", async (_, item) => {
      const { fetcher } = replayingSteamSales({
        featured: withCategoryItems("cat_dailydeal", [item]),
      });

      const { dailyDeal } = await fetchSaleLayer({ fetcher });

      expect(dailyDeal).toBeNull();
    });

    it("keeps a Daily Deal that is merely free", async () => {
      const { fetcher } = replayingSteamSales({
        featured: withCategoryItems("cat_dailydeal", [
          { ...A_DAILY_DEAL, discount_percent: 100, final_price: 0 },
        ]),
      });

      const { dailyDeal } = await fetchSaleLayer({ fetcher });

      expect(dailyDeal).toMatchObject({
        depth: 100,
        finalPrice: { amount: 0, label: "$0.00" },
      });
    });

    it("keeps the Daily Deal when a Sale page fails", async () => {
      const { fetcher } = replayingSteamSales({ salePage: 500 });

      const layer = await fetchSaleLayer({ fetcher });

      expect(layer.sales).toEqual([]);
      expect(layer.dailyDeal).toMatchObject({ appId: 1422440 });
    });

    it("drops a Sale whose page no longer carries an event record", async () => {
      const { fetcher } = replayingSteamSales({
        salePage: withoutEventRecord(),
      });

      const layer = await fetchSaleLayer({ fetcher });

      expect(layer.sales).toEqual([]);
      expect(layer.dailyDeal).toMatchObject({ appId: 1422440 });
    });

    // A reader that went straight for a field would throw out of the loop and
    // cost the valid event standing behind the malformed one.
    it("reads past entries in the event store that are not events", async () => {
      const { fetcher } = replayingSteamSales({
        salePage: withEventsBefore([null, "not an event", 7]),
      });

      const { sales } = await fetchSaleLayer({ fetcher });

      expect(sales).toEqual([CAPTURED_SALE]);
    });

    it.each([
      ["its end time is zero", "rtime32_end_time", 0],
      ["its end time is not a number", "rtime32_end_time", "soon"],
      ["it ends before it starts", "rtime32_end_time", 1],
      ["it has no name", "event_name", ""],
      ["its name is nothing but spaces", "event_name", "   "],
      ["it has no id", "gid", 1234],
      ["its id is empty", "gid", ""],
      ["its id is nothing but spaces", "gid", "  "],
      // `Number.isInteger(1e308)` is true, and a thousand times that is
      // Infinity — which `new Date(...).toISOString()` throws on, where the
      // countdown renders.
      ["it ends past the end of time", "rtime32_end_time", 1e308],
      ["it ends further out than a Date reaches", "rtime32_end_time", 1e15],
      ["it starts past the end of time", "rtime32_start_time", 1e308],
    ])("drops a Sale whose record says %s", async (_, field, value) => {
      const { fetcher } = replayingSteamSales({
        salePage: withEventFields({ [field]: value }),
      });

      const { sales } = await fetchSaleLayer({ fetcher });

      expect(sales).toEqual([]);
    });
  });
});

describe("activeAt", () => {
  it("keeps a Sale running at that instant", () => {
    expect(activeAt([CAPTURED_SALE], WHILE_RUNNING)).toEqual([CAPTURED_SALE]);
  });

  // The already-ended case, and the not-yet-started one: Steam puts a
  // Spotlight up for a campaign before it opens.
  it.each([
    ["it has ended", SALE_ENDS + 1000],
    ["it is the very instant it ends", SALE_ENDS],
    ["it has not started", SALE_STARTS - 1000],
  ])("drops a Sale when %s", (_, now) => {
    expect(activeAt([CAPTURED_SALE], now)).toEqual([]);
  });

  it("puts the soonest deadline first", () => {
    const later: Sale = { ...CAPTURED_SALE, id: "later", endsAt: SALE_ENDS + 1 };
    const sooner: Sale = {
      ...CAPTURED_SALE,
      id: "sooner",
      endsAt: SALE_ENDS - 1,
    };

    expect(
      activeAt([later, CAPTURED_SALE, sooner], WHILE_RUNNING).map((s) => s.id),
    ).toEqual(["sooner", CAPTURED_SALE.id, "later"]);
  });
});
