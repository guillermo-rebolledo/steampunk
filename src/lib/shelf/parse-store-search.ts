import { parse, type HTMLElement } from "node-html-parser";

import type {
  Discount,
  PlatformSupport,
  Price,
  ReviewScore,
} from "@/lib/shelf/types";

/**
 * Turns Steam's store-search markup into Discounts.
 *
 * We parse HTML because Steam publishes no API that enumerates discounted
 * games — see ADR-0004. The markup carries no compatibility guarantee, so this
 * fails soft throughout: a row that does not yield an app id, a price and a
 * review score is dropped, and the rest of the Shelf still renders. Nothing
 * here throws.
 */
export function parseStoreSearchRows(resultsHtml: string): Discount[] {
  const rows = parse(resultsHtml).querySelectorAll("a.search_result_row");
  return rows
    .map((row) => {
      try {
        return toDiscount(row);
      } catch {
        // Markup we do not control changing under us is expected, not
        // exceptional. Losing one row beats losing the page.
        return null;
      }
    })
    .filter((discount): discount is Discount => discount !== null);
}

function toDiscount(row: HTMLElement): Discount | null {
  const appId = readAppId(row);
  const storeUrl = readStoreUrl(row);
  const title = row.querySelector(".title")?.textContent.trim();
  const capsuleUrl = row
    .querySelector(".search_capsule img")
    ?.getAttribute("src");
  if (appId === null || storeUrl === null || !title || !capsuleUrl) return null;

  const reviews = readReviews(row);
  if (reviews === null) return null;

  const block = row.querySelector(".discount_block");
  if (block === null) return null;

  const depth = toInteger(block.getAttribute("data-discount"));
  // `data-price-final` is Steam's own integer, and the value MEM-164 will sort
  // on. The original price has no such attribute, so it is read back out of
  // the display string — which holds for currencies written like USD, and is
  // the first thing to revisit when regions arrive.
  const finalAmount = toInteger(block.getAttribute("data-price-final"));
  const originalLabel = block
    .querySelector(".discount_original_price")
    ?.textContent.trim();
  const finalLabel = block
    .querySelector(".discount_final_price")
    ?.textContent.trim();
  if (depth === null || depth <= 0 || finalAmount === null) return null;
  if (!originalLabel || !finalLabel) return null;

  const originalAmount = toMinorUnits(originalLabel);
  if (originalAmount === null || originalAmount <= finalAmount) return null;

  return {
    appId,
    title,
    capsuleUrl,
    storeUrl,
    depth,
    originalPrice: price(originalAmount, originalLabel),
    finalPrice: price(finalAmount, finalLabel),
    reviews,
    platforms: readPlatforms(row),
    releasedOn: row.querySelector(".search_released")?.textContent.trim() ?? "",
  };
}

/**
 * A `/sub/` row lists every app the package covers, so take the first. The
 * link still goes to the package, not to that app.
 */
function readAppId(row: HTMLElement): number | null {
  const first = row.getAttribute("data-ds-appid")?.split(",")[0];
  const appId = toInteger(first);
  return appId !== null && appId > 0 ? appId : null;
}

/** Steam hangs an `snr` click-tracking parameter off every row's href. */
function readStoreUrl(row: HTMLElement): string | null {
  const href = row.getAttribute("href");
  if (!href) return null;
  const url = new URL(href);
  url.search = "";
  return url.toString();
}

/**
 * Steam states the review score only inside a tooltip, phrased as
 * `Overwhelmingly Positive<br>99% of the 2,099 user reviews for this game are
 * positive.` — a game Steam has not scored yet says so in prose instead, and
 * that absence is what makes it not Rankable.
 */
function readReviews(row: HTMLElement): ReviewScore | null {
  const tooltip = row
    .querySelector(".search_review_summary")
    ?.getAttribute("data-tooltip-html");
  if (!tooltip) return null;

  const [summary, detail] = decodeEntities(tooltip).split("<br>");
  const positivePercent = toInteger(detail?.match(/(\d+)%/)?.[1]);
  const count = toInteger(
    detail?.match(/([\d.,\s]+?)\s*user reviews/)?.[1]?.replace(/\D/g, ""),
  );
  if (!summary?.trim() || positivePercent === null || count === null)
    return null;

  return { summary: summary.trim(), positivePercent, count };
}

function readPlatforms(row: HTMLElement): PlatformSupport {
  const icons = row.querySelectorAll(".search_platforms .platform_img");
  const supported = new Set(icons.flatMap((icon) => icon.classList.value));
  return {
    windows: supported.has("win"),
    mac: supported.has("mac"),
    linux: supported.has("linux"),
  };
}

function price(amount: number, label: string): Price {
  return { amount, label };
}

/**
 * Reads a displayed price back into minor units by keeping its digits:
 * "$9.99" is 999 cents, "$1,299.99" is 129999. True wherever the currency is
 * written with two decimal places, which is every region this ticket serves.
 */
function toMinorUnits(label: string): number | null {
  return toInteger(label.replace(/\D/g, ""));
}

function toInteger(value: string | undefined | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

/** The tooltip arrives as an attribute, so its own markup is escaped twice. */
function decodeEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}
