/**
 * The Sale layer: the campaigns the Shelf sits under, and the one headline
 * Discount of the day. Vocabulary follows CONTEXT.md — say Sale, not event;
 * Spotlight, not banner.
 */

import type { Price } from "@/lib/shelf/types";

/**
 * A promotional slot on Steam's store front page: a campaign label, an image
 * and a link, and nothing else. No dates, and no list of which games it
 * covers — which is why a Spotlight alone cannot carry a countdown.
 */
export type Spotlight = {
  /** The campaign label Steam prints on the slot, e.g. "Publisher Sale". */
  readonly label: string;
  readonly artworkUrl: string;
  /** Where the slot points. Only some point at a Sale; most point at a game. */
  readonly url: string;
};

/**
 * A named, Steam-branded campaign, with the window it actually runs for.
 *
 * The dates are the reason this type exists. They come from the partner event
 * record embedded in the Sale's own page and from nowhere else — see ADR-0006.
 *
 * Deliberately absent: which Discounts belong to the Sale. That membership is
 * not resolved anywhere in this app, so nothing may imply a Shelf card shares
 * this deadline.
 */
export type Sale = {
  /** Steam's event id, stable across fetches. */
  readonly id: string;
  /** The campaign's own name, e.g. "SEGA Publisher Sale 2026". */
  readonly name: string;
  /** The Spotlight's shorter label, e.g. "Publisher Sale". */
  readonly label: string;
  readonly artworkUrl: string;
  /** The Sale's page on Steam. */
  readonly url: string;
  /** Epoch milliseconds. */
  readonly startsAt: number;
  /** Epoch milliseconds. The countdown runs to this. */
  readonly endsAt: number;
};

/**
 * Steam's single headline Discount of the day — one game, not a campaign.
 *
 * It carries no end timestamp: Steam publishes an expiry for the ten curated
 * specials but not for the Daily Deal, so this is shown with its depth and
 * price and no countdown (ADR-0006).
 */
export type DailyDeal = {
  readonly appId: number;
  readonly title: string;
  /** Steam's 460x215 header art — a wider crop than a Shelf capsule. */
  readonly headerUrl: string;
  readonly storeUrl: string;
  /** Discount depth — the percentage the price is cut by. */
  readonly depth: number;
  readonly originalPrice: Price;
  readonly finalPrice: Price;
};

/**
 * What was found on Steam: every Sale a Spotlight pointed at, whether or not
 * it is running now, and the Daily Deal.
 *
 * Deliberately not filtered to what is active. This is what gets cached, and a
 * cached copy is up to an hour old — so which Sales are still running has to
 * be decided when a visitor is served, not when Steam was asked.
 *
 * Either half can be empty: the layer degrades to nothing at all rather than
 * taking the Shelf down with it.
 */
export type SaleLayer = {
  readonly sales: readonly Sale[];
  readonly dailyDeal: DailyDeal | null;
};

/**
 * The layer as one visitor sees it: only the Sales running at `servedAt`,
 * soonest to end first.
 */
export type ServedSaleLayer = {
  readonly sales: readonly Sale[];
  readonly dailyDeal: DailyDeal | null;
  /**
   * The instant this was served at, epoch milliseconds.
   *
   * It is what decided which Sales counted as running, and it seeds the first
   * frame of their countdowns so the server and the browser agree on what to
   * paint before the browser's clock takes over.
   */
  readonly servedAt: number;
};
