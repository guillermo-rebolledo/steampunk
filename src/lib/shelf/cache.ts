import type { Fetcher } from "@/lib/shelf/fetcher";
import { fetchShelf } from "@/lib/shelf/shelf";
import type { Shelf } from "@/lib/shelf/types";

/** How long a Shelf is considered fresh before it is revalidated. */
export const SHELF_FRESH_FOR = 60 * 60 * 1000;

/**
 * How long a failed refresh waits before trying again.
 *
 * Steam's rate-limit block holds for about 31 seconds once tripped, and pacing
 * requests after the fact does not lift it (ADR-0004). Retrying on the next
 * visit would spend five more requests feeding the very block it is waiting
 * out, so this sits comfortably past the measured window rather than on it.
 */
export const RETRY_AFTER_BLOCK = 60 * 1000;

/** A Shelf and when it was assembled, so the interface can say how fresh it is. */
export type ServedShelf = {
  readonly shelf: Shelf;
  readonly fetchedAt: Date;
};

export type ShelfCache = {
  /**
   * The best Shelf available, or `null` if there has never been a good one.
   *
   * Never rejects and never returns an empty Shelf: a refresh that fails
   * leaves the last good Shelf in place, and the visitor sees an older Shelf
   * rather than an error.
   */
  serve(): Promise<ServedShelf | null>;
};

/**
 * Holds the Shelf for an hour and revalidates it behind the visitor.
 *
 * The cache is in-process and per-instance — no datastore, no cron, no
 * background job (ADR-0002). A cold instance pays for one assembly; every
 * visitor after that is served from memory while the refresh, when it is due,
 * happens after the response has already gone out.
 *
 * Holding the assembled Shelf rather than Steam's raw pages is what makes the
 * failure story work: falling back needs something to fall back *to*, and a
 * half-refreshed set of pages is not a Shelf.
 */
export function createShelfCache({
  fetcher,
  now = Date.now,
  onRefreshFailed = reportToLogs,
  afterResponding = (work) => void work,
}: {
  fetcher: Fetcher;
  /** Injected so tests can drive an hour of staleness without waiting one. */
  now?: () => number;
  onRefreshFailed?: (error: unknown) => void;
  /**
   * Hands a revalidation to the host so it outlives the response it was
   * kicked off by. Left as a bare `void` here, and wired to the framework in
   * `live-shelf.ts` — a cache that had to know it was running on a serverless
   * platform could not be tested without one.
   */
  afterResponding?: (work: Promise<void>) => void;
}): ShelfCache {
  let held: ServedShelf | null = null;
  let inFlight: Promise<void> | null = null;
  let nextAttemptAt = Number.NEGATIVE_INFINITY;

  function refresh(): Promise<void> {
    // One assembly at a time. Visitors arriving together on a cold instance
    // share the one in flight rather than each opening five more requests.
    if (inFlight !== null) return inFlight;
    if (now() < nextAttemptAt) return Promise.resolve();

    inFlight = fetchShelf({ fetcher })
      .then((shelf) => {
        held = { shelf, fetchedAt: new Date(now()) };
        nextAttemptAt = Number.NEGATIVE_INFINITY;
      })
      .catch((error: unknown) => {
        nextAttemptAt = now() + RETRY_AFTER_BLOCK;
        onRefreshFailed(error);
      })
      .finally(() => {
        inFlight = null;
      });

    return inFlight;
  }

  return {
    async serve() {
      // Nothing to serve yet, so this visitor does have to wait.
      if (held === null) {
        await refresh();
        return held;
      }

      if (now() - held.fetchedAt.getTime() >= SHELF_FRESH_FOR) {
        // Deliberately not awaited: the visitor gets the Shelf they came for
        // now, and the next one gets the fresher Shelf this builds. Handed to
        // the host rather than dropped, because a promise still in flight when
        // a serverless invocation ends can be frozen there — which would leave
        // `inFlight` set forever and this instance never refreshing again.
        afterResponding(refresh());
      }

      return held;
    },
  };
}

function reportToLogs(error: unknown): void {
  console.warn("Shelf refresh failed; serving the last good Shelf", error);
}
