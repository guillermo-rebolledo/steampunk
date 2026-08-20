import { SORT_ORDERS, type SortOrder } from "@/lib/shelf/sort";

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
      <legend className="sr-only">Sort the Shelf by</legend>
      <span aria-hidden className="text-muted-foreground text-sm">
        Sort by
      </span>

      {SORT_ORDERS.map((order) => (
        <label key={order.value} className="cursor-pointer">
          <input
            type="radio"
            name="sort"
            value={order.value}
            checked={value === order.value}
            onChange={() => onValueChange(order.value)}
            className="peer sr-only"
          />
          <span className="border-border bg-background hover:bg-muted peer-checked:border-transparent peer-checked:bg-primary peer-checked:text-primary-foreground peer-focus-visible:border-ring peer-focus-visible:ring-ring/50 block rounded-lg border px-2.5 py-1.5 text-sm transition-colors peer-focus-visible:ring-3">
            {order.label}
            {/* Which way each ordering runs is not written on the chip, and
                cannot be inferred from a pressed state, so it is said here. */}
            <span className="sr-only"> — {order.hint}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
