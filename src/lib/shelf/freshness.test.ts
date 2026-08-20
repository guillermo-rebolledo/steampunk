import { describe, expect, it } from "vitest";

import { describeFreshness } from "@/lib/shelf/freshness";

const NOON = new Date("2026-08-19T12:00:00Z");

function agedBy(ms: number): string {
  return describeFreshness(new Date(NOON.getTime() - ms), NOON);
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

describe("describeFreshness", () => {
  it("says a Shelf built moments ago is current", () => {
    expect(agedBy(0)).toBe("just now");
    expect(agedBy(59 * SECOND)).toBe("just now");
  });

  it("counts minutes once there is a minute to count", () => {
    expect(agedBy(MINUTE)).toBe("1 minute ago");
    expect(agedBy(5 * MINUTE)).toBe("5 minutes ago");
    expect(agedBy(59 * MINUTE)).toBe("59 minutes ago");
  });

  it("counts hours past the hour, which is when a refresh is already due", () => {
    expect(agedBy(HOUR)).toBe("1 hour ago");
    expect(agedBy(3 * HOUR)).toBe("3 hours ago");
  });

  // Rounding down reads as "at least this old". Rounding up would let a Shelf
  // that is 61 minutes stale describe itself as two hours old, which overstates
  // the problem; understating it would be worse still.
  it("rounds down, so an age is never overstated", () => {
    expect(agedBy(HOUR + 59 * MINUTE)).toBe("1 hour ago");
    expect(agedBy(2 * MINUTE - 1)).toBe("1 minute ago");
  });

  it("treats a clock that has run backwards as current rather than negative", () => {
    // Serverless instances do not share a clock, and a Shelf stamped a moment
    // in the future must not render as "-1 minutes ago".
    expect(agedBy(-5 * MINUTE)).toBe("just now");
  });
});
