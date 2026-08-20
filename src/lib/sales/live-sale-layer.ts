import { after } from "next/server";

import { createSaleLayerCache } from "@/lib/sales/cache";

/**
 * How long to wait on Steam before giving up on a request.
 *
 * The same budget the Shelf gives it. It exists because a connection that
 * hangs never rejects: without it a cold visitor waits until the platform
 * times the whole request out.
 */
const GIVE_UP_ON_STEAM_AFTER = 10 * 1000;

/**
 * The app's Sale layer, wired to the real Steam. The composition root.
 *
 * Module scope, so one server instance holds one layer and warms it once —
 * the same shape as `liveShelf`, and for the same reason (ADR-0002). Kept as
 * its own cache rather than folded into the Shelf's: the two are assembled
 * from different endpoints and either must be able to fail without the other,
 * which one shared refresh could not offer.
 */
export const liveSaleLayer = createSaleLayerCache({
  // Deliberately wrapped rather than passed as bare `fetch`: the caching
  // policy belongs to the cache above, and a second one underneath it would
  // decide staleness where nothing can see it.
  fetcher: (url) =>
    fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(GIVE_UP_ON_STEAM_AFTER),
    }),
  // Revalidation runs after the response has gone out, so it has to be handed
  // to the framework to be kept alive — a promise the request no longer awaits
  // can otherwise be frozen when the invocation ends.
  afterResponding: after,
});
