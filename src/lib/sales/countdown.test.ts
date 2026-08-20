import { describe, expect, it } from "vitest";

import {
  describeRemaining,
  formatCountdown,
  remainingUntil,
} from "@/lib/sales/countdown";

/** Both instants are epoch milliseconds, so tests can say them in prose. */
function at(iso: string): number {
  return Date.parse(iso);
}

describe("remainingUntil", () => {
  it("breaks the gap into days, hours, minutes and seconds", () => {
    expect(
      remainingUntil(at("2026-08-27T17:00:00Z"), at("2026-08-22T18:46:55Z")),
    ).toEqual({ days: 4, hours: 22, minutes: 13, seconds: 5 });
  });

  it("counts the last second as still running", () => {
    expect(
      remainingUntil(at("2026-08-27T17:00:00Z"), at("2026-08-27T16:59:59Z")),
    ).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 1 });
  });

  // The already-ended case. A Sale past its end is not active, and the caller
  // is meant to drop it rather than render a zeroed clock.
  it.each([
    ["the instant it ends", "2026-08-27T17:00:00Z"],
    ["long after it ended", "2026-09-14T09:30:00Z"],
  ])("has nothing left %s", (_, now) => {
    expect(remainingUntil(at("2026-08-27T17:00:00Z"), at(now))).toBeNull();
  });
});

describe("formatCountdown", () => {
  it.each([
    [{ days: 4, hours: 22, minutes: 13, seconds: 5 }, "4d 22h 13m 05s"],
    // Units above the largest non-zero one are dropped, so a Sale with hours
    // left does not read as "0d".
    [{ days: 0, hours: 22, minutes: 13, seconds: 5 }, "22h 13m 05s"],
    [{ days: 0, hours: 0, minutes: 13, seconds: 5 }, "13m 05s"],
    [{ days: 0, hours: 0, minutes: 0, seconds: 5 }, "5s"],
    [{ days: 0, hours: 0, minutes: 0, seconds: 0 }, "0s"],
    // Zeroes below the leading unit are kept, so the string stops jittering
    // in width as it counts down.
    [{ days: 12, hours: 0, minutes: 0, seconds: 0 }, "12d 00h 00m 00s"],
  ])("renders %o as %s", (remaining, expected) => {
    expect(formatCountdown(remaining)).toBe(expected);
  });
});

describe("describeRemaining", () => {
  // What assistive technology is given instead of the ticking string: coarse,
  // whole units, so nothing announces a per-second stream of updates.
  it.each([
    [{ days: 4, hours: 22, minutes: 13, seconds: 5 }, "4 days left"],
    [{ days: 1, hours: 0, minutes: 0, seconds: 0 }, "1 day left"],
    [{ days: 0, hours: 22, minutes: 13, seconds: 5 }, "22 hours left"],
    [{ days: 0, hours: 1, minutes: 59, seconds: 59 }, "1 hour left"],
    [{ days: 0, hours: 0, minutes: 13, seconds: 5 }, "13 minutes left"],
    [{ days: 0, hours: 0, minutes: 1, seconds: 0 }, "1 minute left"],
    [{ days: 0, hours: 0, minutes: 0, seconds: 5 }, "Less than a minute left"],
  ])("describes %o as %s", (remaining, expected) => {
    expect(describeRemaining(remaining)).toBe(expected);
  });
});
