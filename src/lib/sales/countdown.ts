/**
 * How long is left of a Sale.
 *
 * A Discount with no deadline reads as permanent; a Sale ending in "4d 22h"
 * is why someone buys today. That deadline is the whole point of the Sale
 * layer, so the arithmetic behind it is a pure function over two instants and
 * is tested as one.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export type Remaining = {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly seconds: number;
};

/**
 * The time left until `endsAt`, or `null` once that instant has passed.
 *
 * `null` is the already-ended case, and callers are expected to stop
 * presenting the Sale as active rather than render a zeroed clock.
 *
 * Both arguments are epoch milliseconds. Nothing here reads the clock itself:
 * the server renders the first frame from its own `now` and the browser takes
 * over from there, so the two agree on hydration instead of tearing.
 */
export function remainingUntil(endsAt: number, now: number): Remaining | null {
  const left = endsAt - now;
  if (left <= 0) return null;

  return {
    days: Math.floor(left / DAY),
    hours: Math.floor((left % DAY) / HOUR),
    minutes: Math.floor((left % HOUR) / MINUTE),
    seconds: Math.floor((left % MINUTE) / SECOND),
  };
}

/**
 * The ticking form: "4d 22h 13m 05s", dropping units above the largest that
 * is non-zero so a Sale with an hour left does not read as "0d".
 *
 * Seconds are always shown. A clock that visibly moves is what separates a
 * deadline from a date, and this is the one number on the page that earns
 * a per-second repaint.
 */
export function formatCountdown({
  days,
  hours,
  minutes,
  seconds,
}: Remaining): string {
  const units: [number, string][] = [
    [days, "d"],
    [hours, "h"],
    [minutes, "m"],
    [seconds, "s"],
  ];
  const from = units.findIndex(([value]) => value > 0);
  // All four are zero only in the final second before the end.
  const shown = from === -1 ? units.slice(3) : units.slice(from);

  return shown
    .map(([value, suffix], index) =>
      // Leading unit unpadded, the rest padded, so the string stops jittering
      // in width as it counts down.
      index === 0
        ? `${value}${suffix}`
        : `${String(value).padStart(2, "0")}${suffix}`,
    )
    .join(" ");
}

/**
 * The spoken form: coarse, whole units only — "4 days left", "3 hours left".
 *
 * Assistive technology gets this instead of the ticking string. A countdown
 * announced every second is unusable, and the second-by-second precision is
 * not what a screen reader user needs to decide whether to buy today.
 */
export function describeRemaining({
  days,
  hours,
  minutes,
}: Remaining): string {
  if (days > 0) return `${plural(days, "day")} left`;
  if (hours > 0) return `${plural(hours, "hour")} left`;
  if (minutes > 0) return `${plural(minutes, "minute")} left`;
  return "Less than a minute left";
}

function plural(value: number, noun: string): string {
  return `${value} ${noun}${value === 1 ? "" : "s"}`;
}
