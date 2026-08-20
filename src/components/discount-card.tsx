import Image from "next/image";

import type { Discount, PlatformSupport } from "@/lib/shelf/types";

/**
 * One Discount on the Shelf.
 *
 * The whole card is the link, so it is reachable by keyboard with no extra
 * work, and its accessible name says which game and how deep the cut is
 * rather than leaving a screen reader to stitch that together from fragments.
 */
export function DiscountCard({ discount }: { discount: Discount }) {
  const {
    title,
    capsuleUrl,
    storeUrl,
    depth,
    originalPrice,
    finalPrice,
    reviews,
    platforms,
    releasedOn,
  } = discount;

  return (
    <a
      href={storeUrl}
      aria-label={`${title} — ${depth}% off, ${finalPrice.label}, down from ${originalPrice.label}`}
      className="group bg-card text-card-foreground w-full hover:border-foreground/25 flex flex-col overflow-hidden rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Image
        src={capsuleUrl}
        // The capsule is the game's name set in its own lettering, so it says
        // nothing the heading below does not already say.
        alt=""
        width={462}
        height={174}
        sizes="(min-width: 1280px) 24rem, (min-width: 640px) 45vw, 92vw"
        className="bg-muted aspect-[231/87] w-full object-cover"
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h2 className="text-base leading-snug text-pretty">{title}</h2>

        <p className="text-sm">
          {reviews.summary}{" "}
          <span className="text-muted-foreground">
            · {reviews.positivePercent}% of{" "}
            {reviews.count.toLocaleString("en-US")} reviews
          </span>
        </p>

        <p className="text-muted-foreground mt-auto text-xs">
          {releasedOn} · {platformNames(platforms).join(", ")}
        </p>

        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="bg-discount text-discount-foreground rounded px-1.5 py-0.5 text-sm">
            −{depth}%
          </span>
          <s className="text-muted-foreground text-sm">{originalPrice.label}</s>
          <span className="font-mono text-base">{finalPrice.label}</span>
        </p>
      </div>
    </a>
  );
}

function platformNames({ windows, mac, linux }: PlatformSupport): string[] {
  const names = [];
  if (windows) names.push("Windows");
  if (mac) names.push("macOS");
  if (linux) names.push("Linux");
  return names.length > 0 ? names : ["Platform unlisted"];
}
