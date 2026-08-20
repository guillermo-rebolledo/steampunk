import { parse } from "node-html-parser";

/**
 * Reads a Sale's real start and end from its page on Steam.
 *
 * Steam embeds a partner event record in the page's `application_config`
 * element, and that record is the only reliable source of a Sale's window —
 * see ADR-0006. The alternative considered and rejected was inferring the
 * window from when the member Discounts expire, which fails: expiries are
 * staggered per-publisher by seconds rather than synchronised.
 *
 * Like the Shelf parser this fails soft. Markup we do not control changing
 * under us costs the Sale layer, never the page.
 */

/** The window a Sale runs for, in epoch milliseconds. */
export type SaleWindow = {
  readonly id: string;
  readonly name: string;
  readonly startsAt: number;
  readonly endsAt: number;
};

type PartnerEvent = {
  gid?: unknown;
  event_name?: unknown;
  rtime32_start_time?: unknown;
  rtime32_end_time?: unknown;
};

export function parseSaleWindow(html: string): SaleWindow | null {
  try {
    const store = parse(html)
      .querySelector("#application_config")
      ?.getAttribute("data-partnereventstore");
    if (!store) return null;

    const events: unknown = JSON.parse(store);
    if (!Array.isArray(events)) return null;

    // A sale page carries the one event it is the page for. If Steam ever
    // lists several, the first usable one is the page's own — and anything in
    // the array that is not an object at all is skipped rather than read,
    // since a reader that goes straight for a field would throw out of the
    // loop and cost the valid event standing behind it.
    for (const event of events) {
      if (typeof event !== "object" || event === null) continue;
      const window = toSaleWindow(event as PartnerEvent);
      if (window !== null) return window;
    }
    return null;
  } catch {
    return null;
  }
}

function toSaleWindow(event: PartnerEvent): SaleWindow | null {
  // Steam's own event id, and what the band keys its cards by, so an empty
  // one is no more usable than a missing one.
  const id = typeof event.gid === "string" ? event.gid.trim() : "";
  const name =
    typeof event.event_name === "string" ? event.event_name.trim() : "";
  // `rtime32_*` are Steam's epoch *seconds*; everything above this line works
  // in milliseconds so it can be compared against `Date.now()` directly.
  const startsAt = toEpochMs(event.rtime32_start_time);
  const endsAt = toEpochMs(event.rtime32_end_time);

  if (!id || !name || startsAt === null || endsAt === null) return null;
  // A window that does not move forwards is not a window.
  if (endsAt <= startsAt) return null;

  return { id, name, startsAt, endsAt };
}

/**
 * The furthest a `Date` reaches: ±8.64e15 ms, about 275,760 AD.
 *
 * Past it `toISOString` throws a `RangeError` where the countdown renders,
 * which would take the page down — so a timestamp that cannot be a date is
 * dropped here, where dropping things is what this file does.
 */
const LATEST_INSTANT = 8.64e15;

function toEpochMs(seconds: unknown): number | null {
  if (typeof seconds !== "number" || !Number.isInteger(seconds)) return null;
  // Steam writes 0 for "no time set", which is not a date.
  if (seconds <= 0) return null;

  // `Number.isInteger(1e308)` is true, and a thousand times that is Infinity.
  const milliseconds = seconds * 1000;
  return milliseconds <= LATEST_INSTANT ? milliseconds : null;
}
