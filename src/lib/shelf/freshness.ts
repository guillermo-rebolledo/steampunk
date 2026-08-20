const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "always" });

/**
 * How old a Shelf is, in words — "just now", "5 minutes ago", "1 hour ago".
 *
 * Roughly, on purpose. The Shelf is a sample of Steam taken at one moment and
 * revalidated behind the visitor, so what matters is whether they are looking
 * at something current or something Steam has not let us refresh for a while.
 * A prices-as-of timestamp to the second would imply a precision the Shelf
 * does not have.
 *
 * Ages round down, which reads as "at least this old".
 */
export function describeFreshness(fetchedAt: Date, now: Date): string {
  // Clamped at zero: instances do not share a clock, and a Shelf stamped a
  // moment in the future must not describe itself as "-1 minutes ago".
  const age = Math.max(0, now.getTime() - fetchedAt.getTime());

  if (age < MINUTE) return "just now";
  if (age < HOUR) return relative.format(-Math.floor(age / MINUTE), "minute");
  return relative.format(-Math.floor(age / HOUR), "hour");
}
