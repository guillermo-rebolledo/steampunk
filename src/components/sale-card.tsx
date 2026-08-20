import Image from "next/image";

import {
  describeRemaining,
  formatCountdown,
  remainingUntil,
} from "@/lib/sales/countdown";
import type { Sale } from "@/lib/sales/types";

/**
 * One active Sale, framing the Shelf below it.
 *
 * The card is not itself the link. An `aria-label` on a wrapping anchor would
 * replace everything inside it for a screen reader — including the countdown,
 * which is the point of the card. So the campaign's name is the link and it
 * stretches over the card, which keeps the whole card clickable while leaving
 * the time remaining as readable content.
 *
 * Only Sales and their real end timestamps get a countdown. Per-Discount
 * expiry is not in the store-search results the Shelf is built from
 * (ADR-0004), so an ordinary Shelf card has no deadline to count down to and
 * must not be given something that looks like one.
 */
export function SaleCard({ sale, now }: { sale: Sale; now: number }) {
  const { name, label, artworkUrl, url, endsAt } = sale;
  // Never null in practice: the band drops a Sale the moment its window
  // closes, so nothing renders a card whose deadline has passed.
  const remaining = remainingUntil(endsAt, now);

  return (
    <article className="bg-card text-card-foreground focus-within:border-foreground/25 hover:border-foreground/25 relative flex w-full overflow-hidden rounded-lg border transition-[border-color] duration-150 ease-out">
      <Image
        src={artworkUrl}
        // The artwork sets the campaign's name in its own lettering, so it
        // says nothing the heading beside it does not already say.
        alt=""
        width={374}
        height={448}
        sizes="7rem"
        // A fixed-width panel down the side of the card, stretched to whatever
        // height the text beside it needs and cropped to fit.
        className="bg-muted w-24 shrink-0 self-stretch object-cover sm:w-28"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          {label}
        </p>

        <h3 className="text-base leading-snug text-pretty">
          <a
            href={url}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {name}
          </a>
        </h3>

        <p className="mt-auto">
          {remaining !== null && (
            <time
              dateTime={new Date(endsAt).toISOString()}
              className="text-sm tabular-nums"
            >
              {/* The ticking string is decoration to a screen reader: it
                  changes every second, and no assistive technology should be
                  made to follow that. There is deliberately no live region
                  here, so it is read once, on arrival, in the coarse form
                  beside it. */}
              <span aria-hidden="true" className="font-mono">
                {formatCountdown(remaining)}
              </span>
              <span className="sr-only">{describeRemaining(remaining)}</span>
            </time>
          )}
        </p>
      </div>
    </article>
  );
}
