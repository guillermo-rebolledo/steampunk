/**
 * The Shelf and the Discounts on it. Vocabulary follows CONTEXT.md — say
 * Discount, not deal; Discount depth, not savings; Shelf, not catalogue.
 */

/**
 * A price, held twice over.
 *
 * Steam gives both an integer in the currency's minor unit and its own
 * preformatted string. Every comparison and sort uses the integers; every
 * pixel on screen uses the string, so the app never has to know that yen has
 * no decimals or that some regions put the symbol last.
 */
export type Price = {
  /** Minor units — cents for USD. Compare and sort on this. */
  readonly amount: number;
  /** Steam's own formatting, e.g. "$6.99". Display this. */
  readonly label: string;
};

/**
 * What Steam's review summary says about a game: the phrase, the share of
 * reviews that are positive, and how many there are. Its presence is what
 * makes a Discount Rankable.
 */
export type ReviewScore = {
  /** Steam's phrase, e.g. "Overwhelmingly Positive". */
  readonly summary: string;
  /** Share of reviews that are positive, 0–100. */
  readonly positivePercent: number;
  readonly count: number;
};

export type PlatformSupport = {
  readonly windows: boolean;
  readonly mac: boolean;
  readonly linux: boolean;
};

/** One game's price cut — the atomic unit this app displays. */
export type Discount = {
  readonly appId: number;
  readonly title: string;
  /** Steam's 231x87 capsule art. */
  readonly capsuleUrl: string;
  /** Where clicking the card goes, tracking parameters stripped. */
  readonly storeUrl: string;
  /**
   * Discount depth — the percentage the price is cut by. Deliberately not the
   * same axis as `price.final`: 100% off a free-to-play game and 75% off a $60
   * game are different propositions.
   */
  readonly depth: number;
  readonly originalPrice: Price;
  readonly finalPrice: Price;
  readonly reviews: ReviewScore;
  readonly platforms: PlatformSupport;
  /** Steam's preformatted release date, e.g. "Nov 9, 2022". */
  readonly releasedOn: string;
  /**
   * Steam's tags for the game, named and ordered as Steam ranks them. Genres
   * and tags are the same axis here — Steam files "Action" and "Roguelike" in
   * one list and so does this. Empty when a row carries none we can name
   * (ADR-0005).
   */
  readonly tags: readonly string[];
};

/**
 * The fixed set of Discounts the app holds. Every filter, sort and search the
 * user performs happens within it — see ADR-0002 and ADR-0003.
 */
export type Shelf = {
  readonly discounts: readonly Discount[];
  /**
   * How many Rankable Discounts Steam says exist, across every page. Larger
   * than `discounts.length` by design — the Shelf is a sample, never the whole
   * truth, and the interface has to be able to say so.
   */
  readonly totalRankable: number;
};
