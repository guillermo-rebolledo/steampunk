/**
 * Holds something assembled from the network and revalidates it behind the
 * visitor.
 *
 * In-process and per-instance — no datastore, no cron, no background job
 * (ADR-0002). A cold instance pays for one assembly; every visitor after that
 * is served from memory while the refresh, when it is due, happens after the
 * response has already gone out.
 *
 * Holding the assembled value rather than the raw pages it came from is what
 * makes the failure story work: falling back needs something to fall back
 * *to*, and a half-refreshed set of pages is not a Shelf.
 *
 * Extracted so the Shelf and the Sale layer share one set of these semantics.
 * Both hold something built from several Steam requests, both must serve the
 * last good copy through a rate limit rather than an error, and neither can
 * afford a second, subtly different implementation of single-flight and
 * backoff.
 */

export type CachedSource<Held> = {
  /**
   * The best copy available, or `null` if there has never been a good one.
   *
   * Never rejects: a refresh that fails leaves the last good copy in place,
   * and the visitor sees an older one rather than an error.
   *
   * Repeat calls return the same object until a refresh lands, so callers may
   * compare what they were served by identity.
   */
  serve(): Promise<Held | null>;
};

export function createCachedSource<Value, Held extends NonNullable<unknown>>({
  assemble,
  present,
  freshFor,
  retryAfter,
  now = Date.now,
  onRefreshFailed,
  afterResponding = (work) => void work,
}: {
  assemble: () => Promise<Value>;
  /**
   * Names what was assembled in the caller's own vocabulary, and is handed the
   * instant it was assembled at.
   *
   * Applied once per refresh rather than once per visitor, so what `serve`
   * hands back stays the same object until a fresher one replaces it.
   *
   * It may not return `null`: `serve` says `null` to mean "there has never
   * been a good copy", and a `present` that could produce one would make every
   * visit look like a cold cache. `Held` is constrained so that is a type
   * error rather than a caching bug nobody notices.
   */
  present: (value: Value, fetchedAt: Date) => Held;
  /** How long a copy is considered fresh before it is revalidated. */
  freshFor: number;
  /** How long a failed refresh waits before trying again. */
  retryAfter: number;
  /** Injected so tests can drive an hour of staleness without waiting one. */
  now?: () => number;
  onRefreshFailed: (error: unknown) => void;
  /**
   * Hands a revalidation to the host so it outlives the response it was
   * kicked off by. Left as a bare `void` here, and wired to the framework at
   * the composition root — a cache that had to know it was running on a
   * serverless platform could not be tested without one.
   */
  afterResponding?: (work: Promise<void>) => void;
}): CachedSource<Held> {
  let held: Held | null = null;
  /** When `held` was assembled. Kept apart from it because only this cache
      needs it, and what `present` returns is the caller's shape, not ours. */
  let heldAt = 0;
  let inFlight: Promise<void> | null = null;
  let nextAttemptAt = Number.NEGATIVE_INFINITY;

  function refresh(): Promise<void> {
    // One assembly at a time. Visitors arriving together on a cold instance
    // share the one in flight rather than each opening a fresh burst.
    if (inFlight !== null) return inFlight;
    if (now() < nextAttemptAt) return Promise.resolve();

    // `assemble` is somebody else's function, and one that throws where it
    // was called rather than rejecting would escape `refresh` — and `serve`,
    // which promises never to reject — without ever reaching the failure
    // handling below. Starting the chain first puts a synchronous throw and a
    // rejection on the same path.
    inFlight = Promise.resolve()
      .then(assemble)
      .then((value) => {
        const fetchedAt = now();
        // Both together, and only once `present` has returned: a `present`
        // that throws leaves the last good copy in place, and a copy that is
        // still the old one must not be stamped as freshly assembled — that
        // would hold it past its whole freshness window instead of retrying.
        held = present(value, new Date(fetchedAt));
        heldAt = fetchedAt;
        nextAttemptAt = Number.NEGATIVE_INFINITY;
      })
      .catch((error: unknown) => {
        nextAttemptAt = now() + retryAfter;
        withoutEscaping(() => onRefreshFailed(error));
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

      if (now() - heldAt >= freshFor) {
        // Deliberately not awaited: the visitor gets what they came for now,
        // and the next one gets the fresher copy this builds. Handed to the
        // host rather than dropped, because a promise still in flight when a
        // serverless invocation ends can be frozen there — which would leave
        // `inFlight` set forever and this instance never refreshing again.
        //
        // The refresh has already started by the time the handoff is offered,
        // so a host that refuses it — `after` throws outside a request — costs
        // the refresh its lifecycle protection, not the visitor their copy.
        withoutEscaping(() => afterResponding(refresh()));
      }

      return held;
    },
  };
}

/**
 * Runs a side effect that is not allowed to become a failure of its own.
 *
 * `serve` promises never to reject, and both injected hooks are somebody
 * else's code: reporting a failed refresh and handing one to the host are
 * bookkeeping, and neither may turn into the error this cache exists to keep
 * off the visitor's screen.
 *
 * Catching is not enough on its own. TypeScript lets an `async` function stand
 * in for a `() => void`, so a hook can fail by returning a promise that
 * rejects later — past this `try`, and out as an unhandled rejection.
 */
function withoutEscaping(effect: () => unknown): void {
  try {
    void Promise.resolve(effect()).catch(reportIgnored);
  } catch (error) {
    reportIgnored(error);
  }
}

function reportIgnored(error: unknown): void {
  console.warn("A cached source side effect threw and was ignored", error);
}
