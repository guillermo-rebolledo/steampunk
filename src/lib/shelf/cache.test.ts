import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

import {
  createShelfCache,
  RETRY_AFTER_BLOCK,
  SHELF_FRESH_FOR,
  type ShelfCache,
} from "@/lib/shelf/cache";
import type { Fetcher } from "@/lib/shelf/fetcher";
import { replayingSteam } from "@/lib/shelf/steam-test-double";

/** A clock the test moves by hand, so nothing here waits on real time. */
function stoppedClock() {
  let at = Date.parse("2026-08-19T12:00:00Z");
  return {
    now: () => at,
    advanceBy: (ms: number) => {
      at += ms;
    },
  };
}

/**
 * Waits for a background revalidation to land.
 *
 * Counting requests is not enough to know one finished — the fetcher records a
 * call the moment it is entered, well before the pages are parsed and the new
 * Shelf is put in place. Polling `serve` waits for the outcome instead, and
 * costs nothing: while the Shelf is still stale each call joins the refresh
 * already in flight rather than starting another.
 */
async function rebuiltAt(cache: ShelfCache, at: number) {
  await vi.waitFor(async () =>
    expect((await cache.serve())?.fetchedAt.getTime()).toBe(at),
  );
}

describe("createShelfCache", () => {
  let clock: ReturnType<typeof stoppedClock>;
  let onRefreshFailed: Mock<(error: unknown) => void>;

  beforeEach(() => {
    clock = stoppedClock();
    onRefreshFailed = vi.fn();
  });

  function cacheFor(fetcher: Fetcher) {
    return createShelfCache({ fetcher, now: clock.now, onRefreshFailed });
  }

  it("assembles the Shelf on the first visit and stamps when it was built", async () => {
    const source = replayingSteam();
    const cache = cacheFor(source.fetcher);

    const served = await cache.serve();

    expect(served?.shelf.discounts).toHaveLength(497);
    expect(served?.fetchedAt.getTime()).toBe(clock.now());
    expect(source.calls).toHaveLength(5);
  });

  it("serves the cached Shelf for an hour without asking Steam again", async () => {
    const source = replayingSteam();
    const cache = cacheFor(source.fetcher);

    const first = await cache.serve();
    clock.advanceBy(SHELF_FRESH_FOR - 1);
    const second = await cache.serve();

    expect(second?.shelf).toBe(first?.shelf);
    expect(source.calls).toHaveLength(5);
  });

  it("collapses visits arriving together into one assembly", async () => {
    const source = replayingSteam();
    const cache = cacheFor(source.fetcher);

    const [first, second] = await Promise.all([cache.serve(), cache.serve()]);

    // Two visitors landing on a cold instance must not put ten requests into
    // a rate limit that trips at twenty.
    expect(source.calls).toHaveLength(5);
    expect(second?.shelf).toBe(first?.shelf);
  });

  it("revalidates behind the visitor once the hour is up", async () => {
    const source = replayingSteam();
    const cache = cacheFor(source.fetcher);
    const first = await cache.serve();

    clock.advanceBy(SHELF_FRESH_FOR);
    const duringRefresh = await cache.serve();

    // The visitor who triggered the refresh does not wait for it — they get
    // the Shelf that was already there.
    expect(duringRefresh?.shelf).toBe(first?.shelf);
    expect(duringRefresh?.fetchedAt).toEqual(first?.fetchedAt);

    await rebuiltAt(cache, clock.now());
    const afterRefresh = await cache.serve();
    expect(afterRefresh?.shelf).not.toBe(first?.shelf);
    expect(source.calls).toHaveLength(10);
  });

  describe("when Steam is having a bad day", () => {
    it("keeps serving the last good Shelf through a rate limit", async () => {
      const source = replayingSteam();
      const cache = cacheFor(source.fetcher);
      const good = await cache.serve();

      clock.advanceBy(SHELF_FRESH_FOR);
      source.rateLimits();
      await cache.serve();
      await vi.waitFor(() => expect(onRefreshFailed).toHaveBeenCalled());

      const served = await cache.serve();
      expect(served?.shelf).toBe(good?.shelf);
      expect(served?.shelf.discounts).toHaveLength(497);
      // The visitor is told how old this is, not that something broke.
      expect(served?.fetchedAt).toEqual(good?.fetchedAt);
      expect(onRefreshFailed.mock.calls[0][0]).toMatchObject({
        message: expect.stringContaining("429"),
      });
    });

    it("keeps serving the last good Shelf rather than an empty one when the markup is gibberish", async () => {
      const source = replayingSteam();
      const cache = cacheFor(source.fetcher);
      const good = await cache.serve();

      clock.advanceBy(SHELF_FRESH_FOR);
      source.returnsGibberish();
      await cache.serve();
      await vi.waitFor(() => expect(onRefreshFailed).toHaveBeenCalled());

      const served = await cache.serve();
      expect(served?.shelf).toBe(good?.shelf);
      expect(served?.shelf.discounts).toHaveLength(497);
    });

    it("waits out Steam's block before trying again", async () => {
      const source = replayingSteam();
      const cache = cacheFor(source.fetcher);
      await cache.serve();

      clock.advanceBy(SHELF_FRESH_FOR);
      source.rateLimits();
      await cache.serve();
      await vi.waitFor(() => expect(onRefreshFailed).toHaveBeenCalled());
      expect(source.calls).toHaveLength(10);

      // Retrying on the next visit would feed the very block it is waiting
      // out: once tripped, Steam holds it for ~31s however politely you pace
      // afterwards (ADR-0004).
      source.recovers();
      clock.advanceBy(RETRY_AFTER_BLOCK - 1);
      await cache.serve();
      expect(source.calls).toHaveLength(10);

      clock.advanceBy(1);
      await cache.serve();
      await rebuiltAt(cache, clock.now());
      expect(source.calls).toHaveLength(15);
    });

    it("keeps serving the last good Shelf when the connection fails outright", async () => {
      const source = replayingSteam();
      const cache = cacheFor(source.fetcher);
      const good = await cache.serve();

      clock.advanceBy(SHELF_FRESH_FOR);
      source.failsToConnect();
      await cache.serve();
      await vi.waitFor(() => expect(onRefreshFailed).toHaveBeenCalled());

      const served = await cache.serve();
      expect(served?.shelf).toBe(good?.shelf);
      expect(onRefreshFailed.mock.calls[0][0]).toMatchObject({
        message: "fetch failed",
      });
    });

    it("still answers when the failure reporter itself throws", async () => {
      const source = replayingSteam();
      source.rateLimits();
      onRefreshFailed.mockImplementation(() => {
        throw new Error("the logger is having a bad day too");
      });
      const cache = cacheFor(source.fetcher);

      // The cold path is the one that awaits the refresh, so a reporter that
      // throws there rejects the visitor's `serve` — bookkeeping about a
      // failure turning into the error page the cache exists to prevent.
      await expect(cache.serve()).resolves.toBeNull();
    });

    it("still serves when the host refuses to take the revalidation", async () => {
      const source = replayingSteam();
      const cache = createShelfCache({
        fetcher: source.fetcher,
        now: clock.now,
        onRefreshFailed,
        // What `after` does when it is called outside a request lifecycle.
        afterResponding: () => {
          throw new Error("after() was called outside a request scope");
        },
      });
      const good = await cache.serve();

      clock.advanceBy(SHELF_FRESH_FOR);

      await expect(cache.serve()).resolves.toBe(good);
      // The refresh still ran; it just did so without lifecycle protection.
      await rebuiltAt(cache, clock.now());
      expect(source.calls).toHaveLength(10);
    });

    it("has nothing to serve when the very first assembly fails", async () => {
      const source = replayingSteam();
      source.rateLimits();
      const cache = cacheFor(source.fetcher);

      // No last good Shelf exists yet, so there is nothing to fall back to and
      // the interface has to say so rather than draw an empty Shelf.
      await expect(cache.serve()).resolves.toBeNull();
      expect(onRefreshFailed).toHaveBeenCalled();
    });

    it("picks the Shelf back up once Steam recovers", async () => {
      const source = replayingSteam();
      source.rateLimits();
      const cache = cacheFor(source.fetcher);
      await cache.serve();

      source.recovers();
      clock.advanceBy(RETRY_AFTER_BLOCK);
      const served = await cache.serve();

      expect(served?.shelf.discounts).toHaveLength(497);
    });
  });
});
