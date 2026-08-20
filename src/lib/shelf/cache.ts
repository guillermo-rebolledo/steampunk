import { createCachedSource } from "@/lib/cached-source";
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
 * The holding, the single-flight and the backoff are all `createCachedSource`,
 * which the Sale layer's cache is built on too. What is Shelf-specific is only
 * what gets assembled and how long it stays fresh.
 */
export function createShelfCache({
  fetcher,
  now,
  onRefreshFailed = reportToLogs,
  afterResponding,
}: {
  fetcher: Fetcher;
  /** Injected so tests can drive an hour of staleness without waiting one. */
  now?: () => number;
  onRefreshFailed?: (error: unknown) => void;
  afterResponding?: (work: Promise<void>) => void;
}): ShelfCache {
  return createCachedSource<Shelf, ServedShelf>({
    assemble: () => fetchShelf({ fetcher }),
    present: (shelf, fetchedAt) => ({ shelf, fetchedAt }),
    freshFor: SHELF_FRESH_FOR,
    retryAfter: RETRY_AFTER_BLOCK,
    now,
    onRefreshFailed,
    afterResponding,
  });
}

function reportToLogs(error: unknown): void {
  console.warn("Shelf refresh failed; serving the last good Shelf", error);
}
