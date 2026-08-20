import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  RETRY_AFTER_BLOCK,
  SALES_FRESH_FOR,
  createSaleLayerCache,
} from "@/lib/sales/cache";
import {
  SALE_ENDS,
  SALE_STARTS,
  WHILE_RUNNING,
  replayingSteamSales,
} from "@/lib/sales/sales-test-double";
import type { Fetcher } from "@/lib/shelf/fetcher";

/** A clock the test moves by hand, so nothing here waits on real time. */
function stoppedClock(at = WHILE_RUNNING) {
  return {
    now: () => at,
    set: (to: number) => {
      at = to;
    },
    advanceBy: (ms: number) => {
      at += ms;
    },
  };
}

describe("createSaleLayerCache", () => {
  let clock: ReturnType<typeof stoppedClock>;
  let onRefreshFailed: Mock<(error: unknown) => void>;

  beforeEach(() => {
    clock = stoppedClock();
    onRefreshFailed = vi.fn();
  });

  function cacheFor(fetcher: Fetcher) {
    return createSaleLayerCache({ fetcher, now: clock.now, onRefreshFailed });
  }

  it("serves the Sales running now, with the instant they were judged at", async () => {
    const source = replayingSteamSales();

    const served = await cacheFor(source.fetcher).serve();

    expect(served?.servedAt).toBe(WHILE_RUNNING);
    expect(served?.sales.map((sale) => sale.name)).toEqual([
      "SEGA Publisher Sale 2026",
    ]);
    expect(served?.dailyDeal).toMatchObject({ appId: 1422440 });
  });

  it("assembles once and serves the rest from memory", async () => {
    const source = replayingSteamSales();
    const cache = cacheFor(source.fetcher);

    await cache.serve();
    await cache.serve();

    // One Spotlight lookup and one Sale page, not two of each.
    expect(source.urls).toHaveLength(2);
  });

  // The already-ended case, and the reason activeness cannot be cached: the
  // layer is held for an hour, and a campaign that runs out inside that hour
  // has to stop being shown on the next page load, not the next refresh.
  describe("when a Sale is not running at the instant it is served", () => {
    it.each([
      ["it has ended", SALE_ENDS + 1000],
      ["it is the very instant it ends", SALE_ENDS],
      ["it has not started", SALE_STARTS - 1000],
    ])("drops it because %s", async (_, at) => {
      const source = replayingSteamSales();
      const cache = cacheFor(source.fetcher);
      await cache.serve();

      clock.set(at);

      expect((await cache.serve())?.sales).toEqual([]);
    });

    it("still serves the Daily Deal", async () => {
      const source = replayingSteamSales();
      const cache = cacheFor(source.fetcher);
      await cache.serve();

      clock.set(SALE_ENDS + 1000);

      expect((await cache.serve())?.dailyDeal).toMatchObject({
        appId: 1422440,
      });
    });

    // Dropping a Sale is a serve-time decision over what is already held, so
    // it costs Steam nothing. The clock starts a minute short of the end so
    // that crossing it does not also make the layer stale.
    it("does not refetch merely because the Sale ran out", async () => {
      const aMinuteLeft = stoppedClock(SALE_ENDS - 60 * 1000);
      const source = replayingSteamSales();
      const cache = createSaleLayerCache({
        fetcher: source.fetcher,
        now: aMinuteLeft.now,
        onRefreshFailed,
      });
      expect((await cache.serve())?.sales).toHaveLength(1);

      aMinuteLeft.advanceBy(61 * 1000);

      expect((await cache.serve())?.sales).toEqual([]);
      expect(source.urls).toHaveLength(2);
    });
  });

  it("revalidates once the layer goes stale", async () => {
    const source = replayingSteamSales();
    const cache = cacheFor(source.fetcher);
    await cache.serve();

    clock.advanceBy(SALES_FRESH_FOR);
    await cache.serve();

    await vi.waitFor(() => expect(source.urls).toHaveLength(4));
  });

  describe("when Steam does not cooperate", () => {
    /**
     * A fetcher that fails until it is told to recover. `fetchSaleLayer`
     * swallows its own failures, so what reaches the cache is an empty layer
     * rather than a rejection — the cache has to notice that on its own.
     */
    function refusing() {
      let ok = false;
      const urls: string[] = [];
      const fetcher: Fetcher = async (url) => {
        urls.push(url);
        if (!ok) return new Response("", { status: 429 });
        return replayingSteamSales().fetcher(url);
      };
      return { fetcher, urls, recovers: () => void (ok = true) };
    }

    it("has nothing to serve on a cold instance Steam will not answer", async () => {
      const source = refusing();

      await expect(cacheFor(source.fetcher).serve()).resolves.toBeNull();
    });

    it("keeps serving the last good layer through a rate limit", async () => {
      const source = replayingSteamSales();
      const cache = createSaleLayerCache({
        fetcher: async (url) => {
          const response = await source.fetcher(url);
          return failing ? new Response("", { status: 429 }) : response;
        },
        now: clock.now,
        onRefreshFailed,
      });
      let failing = false;

      const good = await cache.serve();
      failing = true;
      clock.advanceBy(SALES_FRESH_FOR);
      await cache.serve();

      const served = await cache.serve();
      expect(served?.sales.map((sale) => sale.name)).toEqual(
        good?.sales.map((sale) => sale.name),
      );
    });

    it("waits out the rate-limit block before trying again", async () => {
      const source = refusing();
      const cache = cacheFor(source.fetcher);
      await cache.serve();
      const spent = source.urls.length;

      await cache.serve();

      // Steam's block holds for ~31 seconds and pacing requests after the fact
      // does not lift it (ADR-0004), so a failed assembly does not retry on
      // the very next visitor.
      expect(source.urls).toHaveLength(spent);

      clock.advanceBy(RETRY_AFTER_BLOCK);
      source.recovers();
      await cache.serve();

      expect((await cache.serve())?.sales).toHaveLength(1);
    });
  });
});
