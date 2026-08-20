import { describe, expect, it, vi } from "vitest";

import { createCachedSource } from "@/lib/cached-source";

const FRESH_FOR = 60 * 60 * 1000;
const RETRY_AFTER = 60 * 1000;

/** A clock the test moves by hand, so nothing here waits on real time. */
function stoppedClock() {
  let at = Date.parse("2026-08-20T12:00:00Z");
  return {
    now: () => at,
    advanceBy: (ms: number) => {
      at += ms;
    },
  };
}

function sourceFor({
  assemble,
  present = (value: string) => value,
  clock = stoppedClock(),
  onRefreshFailed = vi.fn(),
}: {
  assemble: () => Promise<string>;
  present?: (value: string, fetchedAt: Date) => string;
  clock?: ReturnType<typeof stoppedClock>;
  onRefreshFailed?: (error: unknown) => void;
}) {
  return {
    clock,
    onRefreshFailed,
    source: createCachedSource<string, string>({
      assemble,
      present,
      freshFor: FRESH_FOR,
      retryAfter: RETRY_AFTER,
      now: clock.now,
      onRefreshFailed,
    }),
  };
}

describe("createCachedSource", () => {
  // `assemble` is somebody else's function. One that throws where it is called
  // rather than rejecting must not escape a `serve` that promises never to.
  it("does not reject when assembly throws where it is called", async () => {
    const onRefreshFailed = vi.fn();
    const { source } = sourceFor({
      assemble: () => {
        throw new TypeError("fetch failed");
      },
      onRefreshFailed,
    });

    await expect(source.serve()).resolves.toBeNull();
    expect(onRefreshFailed).toHaveBeenCalledWith(expect.any(TypeError));
  });

  it("routes a synchronous assembly failure through the same backoff", async () => {
    let throwing = true;
    const { source, clock } = sourceFor({
      assemble: () => {
        if (throwing) throw new TypeError("fetch failed");
        return Promise.resolve("assembled");
      },
    });
    await source.serve();
    throwing = false;

    // Still inside the backoff window, so the failure is not retried yet.
    await expect(source.serve()).resolves.toBeNull();

    clock.advanceBy(RETRY_AFTER);
    await source.serve();

    await expect(source.serve()).resolves.toBe("assembled");
  });

  describe("when presenting what was assembled fails", () => {
    function refusingToPresent() {
      let good = true;
      const assemble = vi.fn(() => Promise.resolve(good ? "first" : "second"));
      const { source, clock, onRefreshFailed } = sourceFor({
        assemble,
        present: (value) => {
          if (value === "second") throw new Error("cannot present that");
          return value;
        },
      });
      return {
        source,
        clock,
        onRefreshFailed,
        assemble,
        spoil: () => void (good = false),
      };
    }

    it("keeps serving the last good copy", async () => {
      const { source, clock, spoil, onRefreshFailed } = refusingToPresent();
      await source.serve();
      spoil();

      clock.advanceBy(FRESH_FOR);
      await source.serve();
      // The revalidation is deliberately not awaited by `serve`, and the
      // backoff it sets is stamped with the clock as it is when the failure
      // lands — so the test has to wait for that, not merely for the attempt.
      await vi.waitFor(() => expect(onRefreshFailed).toHaveBeenCalled());

      await expect(source.serve()).resolves.toBe("first");
    });

    // The copy still held is the old one, so it must not be stamped as freshly
    // assembled — that would hold it for a whole freshness window rather than
    // retrying once the backoff is up.
    it("retries after the backoff rather than after the freshness window", async () => {
      const { source, clock, spoil, assemble, onRefreshFailed } =
        refusingToPresent();
      await source.serve();
      spoil();

      clock.advanceBy(FRESH_FOR);
      await source.serve();
      await vi.waitFor(() => expect(onRefreshFailed).toHaveBeenCalled());
      expect(assemble).toHaveBeenCalledTimes(2);

      // A minute on: far short of another freshness window, so this only
      // happens if the failed refresh left the old copy's age alone.
      clock.advanceBy(RETRY_AFTER);
      await source.serve();

      await vi.waitFor(() => expect(assemble).toHaveBeenCalledTimes(3));
    });
  });
});
