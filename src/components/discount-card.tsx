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
      // Border colour is the only thing hover changes, so it is the only thing
      // named here: `transition-colors` would have the browser watch six
      // properties on every one of ~500 cards.
      className="group bg-card text-card-foreground hover:border-foreground/25 flex w-full flex-col overflow-hidden rounded-lg border transition-[border-color] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Image
        src={capsuleUrl}
        // The capsule is the game's name set in its own lettering, so it says
        // nothing the heading below does not already say.
        alt=""
        // Steam's capsule really is 231x87, so these are its intrinsic pixels
        // rather than a 2x hint the optimiser could not honour anyway.
        width={231}
        height={87}
        // A ~500-card Shelf means ~500 distinct remote images, and running
        // each through the image optimiser buys a few KB off an 18KB JPEG in
        // exchange for ~500 cold transcodes. Steam already serves it at the
        // size and format the card wants. Lazy loading, which is what keeps
        // the Shelf cheap to open, is Image's default and stays on.
        unoptimized
        // The capsule's own edge, so it does not bleed into the card body.
        // Transparent black and white rather than the border token: this
        // outlines an image, and a neutral that is not pure reads as dirt
        // along the artwork's edge.
        className="bg-muted aspect-[231/87] w-full border-b border-black/10 object-cover dark:border-white/10"
      />

      <div className="flex flex-1 flex-col gap-3 p-4">
        <h3 className="text-base leading-snug text-pretty">{title}</h3>

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
          <span className="bg-discount text-discount-foreground rounded-sm px-1.5 py-0.5 text-sm">
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
