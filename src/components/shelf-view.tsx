"use client";

import { useMemo, useState } from "react";

import { DiscountCard } from "@/components/discount-card";
import { SortControl } from "@/components/sort-control";
import { sortShelf, type SortOrder } from "@/lib/shelf/sort";
import type { Shelf } from "@/lib/shelf/types";

/**
 * The Shelf on screen, in whatever order the visitor asked for.
 *
 * The whole Shelf crosses to the client, which is the point: reordering is a
 * pure function over data already in hand (ADR-0003), so it costs no request,
 * shows no loading state and cannot fail. That is also why this is the one
 * client component in the tree — the sort has to live where the data is.
 *
 * Discount depth is the order the Shelf opens in. It is the ordering Steam
 * itself refuses to serve (ADR-0001) and the one this app exists to offer.
 */
export function ShelfView({ shelf }: { shelf: Shelf }) {
  const [order, setOrder] = useState<SortOrder>("depth");
  const sorted = useMemo(() => sortShelf(shelf, order), [shelf, order]);

  return (
    <>
      <SortControl value={order} onValueChange={setOrder} />

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.discounts.map((discount) => (
          // Keyed by the Discount rather than by position, so reordering moves
          // the cards that already exist instead of rewriting each one in
          // place — no remount, and no capsule art reloading behind the visitor.
          <li key={discount.storeUrl} className="flex">
            <DiscountCard discount={discount} />
          </li>
        ))}
      </ul>
    </>
  );
}
