import Image from "next/image";

import type { DailyDeal } from "@/lib/sales/types";

/**
 * Steam's single headline Discount of the day — one game, not a campaign.
 *
 * It carries its depth and price and no countdown: Steam publishes an expiry
 * for the ten curated specials but not for this one (ADR-0006), and a clock
 * that had to be guessed at would be worse than no clock at all.
 */
export function DailyDealCard({ deal }: { deal: DailyDeal }) {
  const { title, headerUrl, storeUrl, depth, originalPrice, finalPrice } = deal;

  return (
    <article className="bg-card text-card-foreground focus-within:border-foreground/25 hover:border-foreground/25 relative flex w-full overflow-hidden rounded-lg border transition-[border-color] duration-150 ease-out">
      <Image
        src={headerUrl}
        alt=""
        width={460}
        height={215}
        sizes="10rem"
        // Wider than a Sale's panel, because header art is landscape where
        // spotlight artwork is portrait, and a narrow crop of it loses the game.
        className="bg-muted w-32 shrink-0 self-stretch object-cover sm:w-40"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <p className="text-muted-foreground text-xs tracking-wide uppercase">
          Daily Deal
        </p>

        <h3 className="text-base leading-snug text-pretty">
          <a
            href={storeUrl}
            className="rounded-sm after:absolute after:inset-0 focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {title}
          </a>
        </h3>

        <p className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="bg-discount text-discount-foreground rounded px-1.5 py-0.5 text-sm">
            −{depth}%
          </span>
          <s className="text-muted-foreground text-sm">{originalPrice.label}</s>
          <span className="font-mono text-base">{finalPrice.label}</span>
        </p>
      </div>
    </article>
  );
}
