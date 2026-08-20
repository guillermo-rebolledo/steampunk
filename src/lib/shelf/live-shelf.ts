import { after } from "next/server";

import { createShelfCache } from "@/lib/shelf/cache";

/**
 * How long to wait on Steam before giving up on a page.
 *
 * Five pages in parallel land in ~400ms (ADR-0004), so this is not a budget
 * anything healthy comes near. It exists because a connection that hangs never
 * rejects: without it a cold visitor waits until the platform times the whole
 * request out, and the refresh it started stays in flight forever.
 */
const GIVE_UP_ON_STEAM_AFTER = 10 * 1000;

/**
 * The app's Shelf, wired to the real Steam. The composition root.
 *
 * Module scope, so one server instance holds one Shelf and warms it once. That
 * is the whole of the persistence story — no datastore, no cron, no background
 * job (ADR-0002). An instance that has not served a visitor in an hour simply
 * assembles a fresh Shelf for the one who wakes it.
 */
export const liveShelf = createShelfCache({
  // Deliberately wrapped rather than passed as bare `fetch`: the caching
  // policy belongs to the Shelf cache above, and a second one underneath it
  // would decide staleness where nothing can see it.
  fetcher: (url) =>
    fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(GIVE_UP_ON_STEAM_AFTER),
    }),
  // Revalidation runs after the response has gone out, so it has to be handed
  // to the framework to be kept alive — a promise the request no longer awaits
  // can otherwise be frozen when the invocation ends, taking the instance's
  // ability to ever refresh again with it.
  afterResponding: after,
});
