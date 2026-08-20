import { createCachedSource } from "@/lib/cached-source";
import { activeAt, fetchSaleLayer } from "@/lib/sales/sale-layer";
import type { SaleLayer, ServedSaleLayer } from "@/lib/sales/types";
import type { Fetcher } from "@/lib/shelf/fetcher";

/**
 * How long a Sale layer is considered fresh before it is revalidated.
 *
 * The same hour the Shelf is held for. Campaigns turn over on the order of
 * days and the Daily Deal daily, so an hour is generous either way — what it
 * really buys is that assembling the layer costs Steam four requests an hour
 * per instance rather than four per visitor, which is the difference between
 * comfortably inside ADR-0004's rate limit and reliably outside it.
 */
export const SALES_FRESH_FOR = 60 * 60 * 1000;

/** As long as the Shelf waits, and for the same measured reason (ADR-0004). */
export const RETRY_AFTER_BLOCK = 60 * 1000;

export type SaleLayerCache = {
  /**
   * The Sales running right now and the Daily Deal, or `null` if Steam has
   * never answered. Never rejects.
   */
  serve(): Promise<ServedSaleLayer | null>;
};

/**
 * Holds the Sale layer for an hour and revalidates it behind the visitor.
 *
 * Which Sales are *running* is decided per visitor, not per refresh. The
 * windows themselves are stable facts and cache happily; whether a window
 * contains this moment does not, and a Sale that ended forty minutes into a
 * cached hour has to disappear on the next page load rather than the next
 * refresh.
 */
export function createSaleLayerCache({
  fetcher,
  now = Date.now,
  onRefreshFailed = reportToLogs,
  afterResponding,
}: {
  fetcher: Fetcher;
  /** Injected so tests can drive an hour of staleness without waiting one. */
  now?: () => number;
  onRefreshFailed?: (error: unknown) => void;
  afterResponding?: (work: Promise<void>) => void;
}): SaleLayerCache {
  const source = createCachedSource<SaleLayer, SaleLayer>({
    assemble: () => fetchSaleLayer({ fetcher }),
    present: (layer) => layer,
    freshFor: SALES_FRESH_FOR,
    retryAfter: RETRY_AFTER_BLOCK,
    now,
    onRefreshFailed,
    afterResponding,
  });

  return {
    async serve() {
      const held = await source.serve();
      if (held === null) return null;

      // One read of the clock, so the instant that decides which Sales are
      // running is the same one their countdowns start from.
      const servedAt = now();
      return {
        sales: activeAt(held.sales, servedAt),
        dailyDeal: held.dailyDeal,
        servedAt,
      };
    },
  };
}

function reportToLogs(error: unknown): void {
  console.warn("Sale layer refresh failed; serving the last good one", error);
}
