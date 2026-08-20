import { readFileSync } from "node:fs";

import type { Fetcher } from "@/lib/shelf/fetcher";
import { PAGE_COUNT, PAGE_SIZE } from "@/lib/shelf/shelf";

/**
 * Steam's store search, as captured and as it misbehaves.
 *
 * Shared by every test that drives the data layer, so the fixtures are loaded
 * and sliced in one place — recapturing them otherwise means fixing up the
 * same helpers in two files, and the copies drift.
 */

/**
 * A real capture of Steam's store search, taken 2026-08-19 with
 * `specials=1&infinite=1&sort_by=Reviews_DESC&count=100&cc=us&l=english` and
 * one file per `start` offset. All five were captured in the same burst, so
 * they are one consistent slice of the ranking rather than five moments.
 * Recapture them by running those requests and saving the bodies verbatim.
 */
const CAPTURED = new Map(
  pageStarts().map((start) => [
    start,
    readFileSync(
      new URL(`./fixtures/store-search/start-${start}.json`, import.meta.url),
      "utf8",
    ),
  ]),
);

type SearchEnvelope = { results_html: string; total_count: number };

export function pageStarts(): number[] {
  return Array.from({ length: PAGE_COUNT }, (_, page) => page * PAGE_SIZE);
}

export function startOf(url: string): number {
  return Number(new URL(url).searchParams.get("start"));
}

export function capturedPage(start: number): string {
  const payload = CAPTURED.get(start);
  if (payload === undefined) throw new Error(`No page captured at ${start}`);
  return payload;
}

export function jsonResponse(body: unknown): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
}

/** Pulls whole `<a class="search_result_row">` blocks out of a captured page. */
export function capturedRows(start = 0): string[] {
  const { results_html: html } = JSON.parse(
    capturedPage(start),
  ) as SearchEnvelope;
  return html
    .split(/(?=<a href="https:\/\/store\.steampowered\.com\/)/)
    .slice(1);
}

/**
 * A fetcher replaying the captured pages, recording what it was asked for and
 * able to start misbehaving mid-test — Steam having a bad day, in other words.
 */
export function replayingSteam() {
  const serveCapture = (url: string) =>
    jsonResponse(capturedPage(startOf(url)));
  let respond: (url: string) => Response = serveCapture;
  let refuse: (() => never) | null = null;

  const calls: string[] = [];
  const fetcher: Fetcher = async (url) => {
    calls.push(url);
    refuse?.();
    return respond(url);
  };

  return {
    fetcher,
    calls,
    /** The rate limit ADR-0004 measured: ~20 requests in a short window. */
    rateLimits() {
      refuse = null;
      respond = () =>
        new Response("", { status: 429, statusText: "Too Many Requests" });
    },
    /** What a Steam outage page actually looks like: HTTP 200, HTML body. */
    returnsGibberish() {
      refuse = null;
      respond = () =>
        new Response("<html><body>Something went wrong</body></html>", {
          headers: { "content-type": "text/html" },
        });
    },
    /** A connection that never opens, or one the timeout gave up on. */
    failsToConnect() {
      refuse = () => {
        throw new TypeError("fetch failed");
      };
    },
    recovers() {
      refuse = null;
      respond = serveCapture;
    },
  };
}

/**
 * A fetcher serving crafted rows as Steam's first page, reporting only one
 * page of Rankable Discounts so the four pages past them come back
 * legitimately empty — which is what Steam really does once results run out.
 */
export function replayingRows(rows: string): Fetcher {
  const envelope = JSON.parse(capturedPage(0)) as SearchEnvelope;
  return async (url) =>
    jsonResponse({
      ...envelope,
      results_html: startOf(url) === 0 ? rows : "",
      total_count: PAGE_SIZE,
    });
}
