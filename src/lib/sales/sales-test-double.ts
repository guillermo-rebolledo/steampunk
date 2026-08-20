import { readFileSync } from "node:fs";

import type { Fetcher } from "@/lib/shelf/fetcher";

/**
 * Steam's Sale endpoints, as captured and as they misbehave.
 *
 * Shared by every test that drives the Sale layer, so the fixtures are loaded
 * and served in one place — recapturing them otherwise means fixing up the
 * same helpers in two files, and the copies drift.
 *
 * Real captures taken 2026-08-20, both with `cc=us&l=english`:
 *
 * - `featured-categories.json` — `api/featuredcategories`, which lists the
 *   Spotlights and the Daily Deal.
 * - `sale-page.html` — the page one of those Spotlights points at, carrying
 *   the partner event record the countdown is driven from.
 *
 * Recapture either by saving the response body of its request verbatim.
 */
export const capturedFeatured = readFileSync(
  new URL("./fixtures/featured-categories.json", import.meta.url),
  "utf8",
);
export const capturedSalePage = readFileSync(
  new URL("./fixtures/sale-page.html", import.meta.url),
  "utf8",
);

/** The real window of the captured Sale, as Steam's own event record states it. */
export const SALE_STARTS = Date.parse("2026-08-13T17:02:00Z");
export const SALE_ENDS = Date.parse("2026-08-27T17:00:00Z");
/** An instant inside that window. */
export const WHILE_RUNNING = Date.parse("2026-08-20T12:00:00Z");

/**
 * A fetcher that serves each captured payload from the URL it was captured
 * from, and records everything it was asked for.
 *
 * An override is either a replacement body or an HTTP status to fail with.
 * Anything unrecognised 404s, so a wrong URL fails the test rather than
 * silently replaying the wrong body.
 */
export function replayingSteamSales(
  overrides: { featured?: string | number; salePage?: string | number } = {},
) {
  const urls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    urls.push(url);
    const { pathname } = new URL(url);
    if (pathname === "/api/featuredcategories") {
      return serve(overrides.featured ?? capturedFeatured);
    }
    if (pathname.startsWith("/sale/")) {
      return serve(overrides.salePage ?? capturedSalePage);
    }
    return new Response("", { status: 404 });
  };

  return {
    fetcher,
    urls,
    salePageUrls: () => urls.filter((url) => url.includes("/sale/")),
  };
}

function serve(payload: string | number): Response {
  return typeof payload === "number"
    ? new Response("", { status: payload })
    : new Response(payload);
}

/**
 * Rewrites fields of the captured page's first partner event record, leaving
 * the rest of the real page intact.
 *
 * The record lives in an HTML attribute, so it is decoded, patched as data and
 * re-encoded — the same round trip the parser makes. Editing the escaped JSON
 * in place with a regex was the obvious alternative and is a trap: a value
 * carrying `$&`, or an entity, or a comma inside a string, each corrupt the
 * record in a different way, and the test that hit one would look like a
 * parser bug rather than a fixture bug.
 */
export function withEventFields(patch: Record<string, unknown>): string {
  const unknownField = Object.keys(patch).find(
    (field) => !(field in firstEvent()),
  );
  if (unknownField !== undefined) {
    throw new Error(`The capture no longer has a ${unknownField} to rewrite`);
  }

  return withEventStore((events) => [
    { ...(events[0] as object), ...patch },
    ...events.slice(1),
  ]);
}

/** The captured page with entries put in front of its real event record. */
export function withEventsBefore(entries: unknown[]): string {
  return withEventStore((events) => [...entries, ...events]);
}

/** The captured page with its partner event record gone entirely. */
export function withoutEventRecord(): string {
  return capturedSalePage.replace(/ data-partnereventstore="[^"]*"/, "");
}

function firstEvent(): Record<string, unknown> {
  return eventStore()[0] as Record<string, unknown>;
}

function eventStore(): unknown[] {
  const encoded = capturedSalePage.match(
    /data-partnereventstore="([^"]*)"/,
  )?.[1];
  if (encoded === undefined) {
    throw new Error("The capture no longer carries a partner event store");
  }
  return JSON.parse(decodeEntities(encoded)) as unknown[];
}

function withEventStore(edit: (events: unknown[]) => unknown[]): string {
  return capturedSalePage.replace(
    /data-partnereventstore="[^"]*"/,
    () =>
      `data-partnereventstore="${encodeEntities(JSON.stringify(edit(eventStore())))}"`,
  );
}

function decodeEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

/** Ampersands first, or the entities written after them escape themselves. */
function encodeEntities(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/**
 * The captured payload carrying only the given items under `id`.
 *
 * For driving malformed slots through the parser: the envelope stays real, and
 * only what Steam put in the slots is somebody's bad day. Steam sends one
 * category per Spotlight slot rather than one category holding every slot, so
 * every category of that kind is emptied and the first is given these items —
 * emptying one and leaving five would leave the real Spotlights in play.
 */
export function withCategoryItems(id: string, items: unknown[]): string {
  const payload = JSON.parse(capturedFeatured) as Record<string, unknown>;
  const keys = Object.keys(payload).filter(
    (name) => (payload[name] as { id?: unknown } | null)?.id === id,
  );
  if (keys.length === 0) {
    throw new Error(`The capture no longer has a ${id} category`);
  }

  for (const [index, key] of keys.entries()) {
    payload[key] = { ...(payload[key] as object), items: index === 0 ? items : [] };
  }
  return JSON.stringify(payload);
}

/**
 * The captured payload promoting one Sale per slug, standing in for a store
 * front page running more campaigns at once than Steam ever has.
 */
export function withSpotlightSales(slugs: string[]): string {
  return withCategoryItems(
    "cat_spotlight",
    slugs.map((slug) => ({
      name: "Publisher Sale",
      header_image:
        "https://shared.akamai.steamstatic.com/store_item_assets/steam/spotlights/x/y/vertical_capsule_english.jpg",
      url: `https://store.steampowered.com/sale/${slug}`,
    })),
  );
}

/**
 * The captured payload with its Spotlight slots repeated verbatim, standing in
 * for Steam promoting the same campaign from several slots at once.
 */
export function withSpotlightsRepeated(times: number): string {
  const payload = JSON.parse(capturedFeatured) as Record<string, unknown>;
  const spotlights = Object.values(payload).filter(
    (category): category is { id: string } =>
      typeof category === "object" &&
      category !== null &&
      (category as { id?: unknown }).id === "cat_spotlight",
  );

  for (let copy = 0; copy < times; copy += 1) {
    for (const [index, spotlight] of spotlights.entries()) {
      payload[`copy_${copy}_${index}`] = spotlight;
    }
  }
  return JSON.stringify(payload);
}
