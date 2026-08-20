"use client";

import { useMemo, useState } from "react";

import { ClearFiltersButton } from "@/components/clear-filters-button";
import { DiscountCard } from "@/components/discount-card";
import { FilterPanel } from "@/components/filter-panel";
import { SortControl } from "@/components/sort-control";
import {
  UNFILTERED,
  activeFilterCount,
  filterShelf,
  isClearable,
  tagsOnShelf,
  type ShelfFilters,
} from "@/lib/shelf/filter";
import { sortShelf, type SortOrder } from "@/lib/shelf/sort";
import type { Shelf } from "@/lib/shelf/types";

/**
 * The Shelf on screen: narrowed to what the visitor asked for, in the order
 * they asked for it.
 *
 * The whole Shelf crosses to the client, which is the point: filtering,
 * searching and reordering are pure functions over data already in hand
 * (ADR-0003), so each costs no request, shows no loading state and cannot
 * fail. The Shelf is still fetched on the server and rendered there in its
 * opening order; only the reworking needs a client, so only that is one.
 *
 * Discount depth is the order the Shelf opens in. It is the ordering Steam
 * itself refuses to serve (ADR-0001) and the one this app exists to offer.
 *
 * What is being narrowed is the Shelf — a few hundred well-reviewed Discounts,
 * not Steam's ten thousand. Every count and the empty state below say so,
 * because a filter that returns nothing is otherwise read as a claim about
 * Steam, and it is not one.
 */
export function ShelfView({ shelf }: { shelf: Shelf }) {
  const [filters, setFilters] = useState<ShelfFilters>(UNFILTERED);
  const [order, setOrder] = useState<SortOrder>("depth");

  // Tag counts are facets, not a census: they count the Shelf as every other
  // filter has already narrowed it, so a chip reading "Action 17" means
  // picking it lands on seventeen rather than on a number taken from a Shelf
  // the visitor is no longer looking at.
  const tags = useMemo(
    () => tagsOnShelf(filterShelf(shelf, { ...filters, tags: [] })),
    [shelf, filters],
  );
  // Narrow first, then order: sorting what survives is cheaper than sorting
  // the whole Shelf on every keystroke, and the result is the same either way.
  const matching = useMemo(
    () => sortShelf(filterShelf(shelf, filters), order).discounts,
    [shelf, filters, order],
  );

  const activeCount = activeFilterCount(filters);
  const clear = () => setFilters(UNFILTERED);
  const onShelf = shelf.discounts.length;

  return (
    <>
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        tags={tags}
        activeCount={activeCount}
        canClear={isClearable(filters)}
        onClear={clear}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Always on screen — the count is the one thing that tells you a
            filter did anything at all. Only the count itself is the live
            region: the sentence after it never changes, and re-reading it on
            every keystroke would bury the number that did. */}
        <p className="max-w-2xl text-sm text-pretty">
          {/* "on the Shelf" is inside the live region, not after it: a screen
              reader announcing a bare "12 of 500" would be announcing a
              number with no idea what it counts. */}
          <span role="status" className="tabular-nums">
            {matching.length === onShelf
              ? `All ${onShelf} discounts on the Shelf`
              : `${matching.length} of ${onShelf} discounts on the Shelf`}
            .
          </span>{" "}
          <span className="text-muted-foreground">
            Filters search the Shelf — the {onShelf} best-reviewed of the{" "}
            {shelf.totalRankable.toLocaleString("en-US")} well-reviewed
            discounts live on Steam — and never Steam itself.
          </span>
        </p>

        <SortControl value={order} onValueChange={setOrder} />
      </div>

      {matching.length === 0 ? (
        <EmptyState shelf={shelf} onClear={clear} />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {matching.map((discount) => (
            // Keyed by the Discount rather than by position, so reordering
            // moves the cards that already exist instead of rewriting each one
            // in place — no remount, and no capsule art reloading behind the
            // visitor.
            <li key={discount.storeUrl} className="flex">
              <DiscountCard discount={discount} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * Nothing matched.
 *
 * The reason is almost never "Steam has no such game" — it is that the Shelf
 * is roughly 5% of live discounts by design (ADRs 0001, 0002 and 0003), so a
 * narrow combination running out is the expected behaviour of a small sample.
 * Saying that plainly is the difference between an honest empty state and one
 * that quietly claims Steam has nothing.
 */
function EmptyState({ shelf, onClear }: { shelf: Shelf; onClear: () => void }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed p-6 sm:p-8">
      <h2 className="text-lg">No discounts on the Shelf match</h2>
      <p className="text-muted-foreground max-w-prose text-sm text-pretty">
        That is a fact about the Shelf, not about Steam. The Shelf holds{" "}
        {shelf.discounts.length} of the{" "}
        {shelf.totalRankable.toLocaleString("en-US")} well-reviewed games
        discounted right now — chosen by review score, not by what you filtered
        for, and games Steam has not scored at all never reach it. A narrow
        combination can genuinely come up empty here while Steam still has
        such a game discounted.
      </p>
      <p className="text-muted-foreground max-w-prose text-sm text-pretty">
        Widen a filter, or start over.
      </p>
      <ClearFiltersButton onClick={onClear} />
    </div>
  );
}
