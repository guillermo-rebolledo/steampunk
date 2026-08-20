"use client";

import { useEffect, useMemo, useState } from "react";

import { DailyDealCard } from "@/components/daily-deal-card";
import { SaleCard } from "@/components/sale-card";
import { activeAt } from "@/lib/sales/sale-layer";
import type { ServedSaleLayer } from "@/lib/sales/types";

/**
 * The band above the Shelf: the campaigns running right now, and the Daily
 * Deal.
 *
 * A client component because it owns a clock. The server decides which Sales
 * are running when the page is built, but a campaign can run out while the
 * page is open — and a card sitting under "Running now" for a Sale that ended
 * two minutes ago is exactly the claim this layer must not make. So the same
 * `activeAt` that filtered on the server runs again every second here, and a
 * Sale leaves the band the moment its window closes.
 *
 * Renders nothing at all when there is nothing running and no Daily Deal —
 * Steam rate limiting the lookup, or simply no Spotlight Sale being up. The
 * Shelf below stands on its own either way.
 *
 * The copy has one job beyond naming things: to keep the countdowns attached
 * to the Sales they belong to. Which Discounts a Sale covers is not resolved
 * anywhere in this app, and the Shelf below is ranked by review score rather
 * than drawn from any campaign, so nothing here may suggest the two share a
 * deadline.
 */
export function SaleLayer({ layer }: { layer: ServedSaleLayer }) {
  const { sales, dailyDeal, servedAt } = layer;
  const now = useNow(servedAt);
  const running = useMemo(() => activeAt(sales, now), [sales, now]);

  if (running.length === 0 && dailyDeal === null) return null;

  return (
    <section aria-labelledby="running-now" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 id="running-now" className="text-xl sm:text-2xl">
          Running now
        </h2>
        <p className="text-muted-foreground max-w-2xl text-sm text-pretty">
          {running.length > 0
            ? "Steam campaigns live right now, each counting down to its own end. Which games a Sale covers is not shown here, and the Discounts below are ranked by review score rather than drawn from any of these."
            : "No Steam campaign is being promoted right now, so only today's headline Discount is here. The Discounts below are ranked by review score."}
        </p>
      </div>

      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {dailyDeal !== null && (
          <li className="flex">
            <DailyDealCard deal={dailyDeal} />
          </li>
        )}
        {running.map((sale) => (
          <li key={sale.id} className="flex">
            <SaleCard sale={sale} now={now} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The clock the band runs on, ticking once a second.
 *
 * Seeded with the server's instant so the first client render matches the
 * markup that arrived — reading `Date.now()` during render instead would tear
 * on hydration. The browser's clock takes over immediately after.
 */
function useNow(servedAt: number): number {
  const [now, setNow] = useState(servedAt);

  useEffect(() => {
    // Immediately, because the server's instant is already a round trip old.
    const tick = () => setNow(Date.now());
    tick();
    const ticking = setInterval(tick, 1000);
    return () => clearInterval(ticking);
  }, []);

  return now;
}
