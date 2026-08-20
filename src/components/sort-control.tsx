"use client";

import { SORT_ORDERS, type SortOrder } from "@/lib/shelf/sort";

/**
 * What each ordering is called, and which way it runs.
 *
 * Kept here rather than beside the comparators so the sort module changes only
 * when sorting does, and this one only when the wording does. Nothing can drift
 * apart: the record is keyed by `SortOrder`, so a new ordering fails to compile
 * until it is named.
 *
 * "Final price" is the glossary's term, and the distinction CONTEXT.md insists
 * on — ranking by Discount depth is not ranking by final price.
 */
const ORDERINGS: Record<SortOrder, { name: string; direction: string }> = {
  depth: { name: "Discount depth", direction: "Steepest cut first" },
  price: { name: "Final price", direction: "Cheapest first" },
  reviews: { name: "Review score", direction: "Best regarded first" },
  released: { name: "Release date", direction: "Newest first" },
};

/**
 * How the visitor reorders the Shelf.
 *
 * Built from native radios rather than a menu or a listbox: every ordering is
 * visible at once, so which one is active is legible without opening anything,
 * and the browser supplies the whole keyboard and assistive-technology
 * contract — a group the visitor tabs into once, arrow keys to move between
 * orderings, and the current value announced as a checked radio.
 *
 * The inputs are visually hidden rather than removed; `sr-only` clips them but
 * leaves them focusable, and each label is styled off its input's state.
 */
export function SortControl({
  value,
  onValueChange,
}: {
  value: SortOrder;
  onValueChange: (value: SortOrder) => void;
}) {
  return (
    <fieldset className="flex flex-wrap items-center gap-2">
      {/* A <legend> is laid out outside its fieldset's flow, so it cannot sit
          in this row. It is hidden and repeated as the span below, word for
          word — a group whose visible label and announced name disagree is its
          own accessibility bug. */}
      <legend className="sr-only">Sort by</legend>
      <span aria-hidden className="text-muted-foreground text-sm">
        Sort by
      </span>

      {SORT_ORDERS.map((order) => (
        <label key={order} className="cursor-pointer">
          <input
            type="radio"
            name="sort"
            value={order}
            checked={value === order}
            onChange={() => onValueChange(order)}
            className="peer sr-only"
          />
          <span className="border-border bg-background hover:bg-muted peer-checked:border-transparent peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:border-ring peer-focus-visible:ring-ring/50 block rounded-lg border px-2.5 py-1.5 text-sm transition-colors peer-focus-visible:ring-3">
            {ORDERINGS[order].name}
            {/* Which way an ordering runs is not written on the chip, and
                cannot be inferred from a checked state, so it is said here. */}
            <span className="sr-only"> — {ORDERINGS[order].direction}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
