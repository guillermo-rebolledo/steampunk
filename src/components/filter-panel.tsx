"use client";

import { useId, useState } from "react";

import { ClearFiltersButton } from "@/components/clear-filters-button";
import { Button } from "@/components/ui/button";
import {
  PLATFORMS,
  type Platform,
  type ShelfFilters,
  type TagCount,
} from "@/lib/shelf/filter";
import { cn } from "@/lib/utils";

/**
 * Price ceilings offered, in minor units, cheapest first.
 *
 * Labelled below as whole dollars. That holds for the one region the Shelf is
 * fetched for, and is the same USD assumption `parse-store-search.ts` makes
 * reading an original price back out of its label — both are what regions
 * revisit when they arrive.
 */
const PRICE_CEILINGS = [500, 1000, 2000, 4000] as const;

/** Discount depth floors offered, as percentages. */
const DEPTH_FLOORS = [25, 50, 75, 90] as const;

const PLATFORM_NAMES: Record<Platform, string> = {
  windows: "Windows",
  mac: "macOS",
  linux: "Linux",
};

/** How many tags are shown before the list has to be asked to open up. */
const TAGS_SHOWN = 12;

/**
 * The controls that narrow the Shelf.
 *
 * Stateless apart from what is expanded — the filters themselves live one
 * level up, so this component can be handed a fixture and read straight
 * through.
 *
 * Every control is a native form element or a real `<button>`. Nothing here
 * reimplements a checkbox, so keyboard operation, focus order and the state
 * assistive technology reads are the browser's to get right rather than ours.
 */
export function FilterPanel({
  filters,
  onChange,
  tags,
  activeCount,
  canClear,
  onClear,
}: {
  filters: ShelfFilters;
  onChange: (filters: ShelfFilters) => void;
  /**
   * The tags carried by the Discounts currently on screen, with their counts
   * — so an unselected tag's count is exactly what picking it would leave.
   */
  tags: readonly TagCount[];
  /** How many filters are doing something — 0 means the whole Shelf. */
  activeCount: number;
  /** Whether there is anything for "clear" to undo, filter or stray text. */
  canClear: boolean;
  onClear: () => void;
}) {
  const searchId = useId();
  const priceId = useId();
  const depthId = useId();
  const controlsId = useId();
  const tagsId = useId();
  const [showAllTags, setShowAllTags] = useState(false);
  // Only consulted below the `sm` breakpoint; above it CSS keeps the controls
  // open regardless, so the first render is the same on server and client.
  const [showControls, setShowControls] = useState(false);

  // Selected tags lead, are drawn from the filters rather than from the
  // counts, and are never collapsed away. A filter the visitor cannot see is
  // a filter they cannot turn off — and once the other filters narrow to
  // nothing there are no counts at all, which would otherwise take every
  // active tag off screen and strand the visitor on an empty Shelf.
  const unselectedTags = tags.filter((tag) => !filters.tags.includes(tag.name));
  const collapsedTags = showAllTags
    ? unselectedTags
    : unselectedTags.slice(0, TAGS_SHOWN);

  function toggleTag(name: string) {
    onChange({ ...filters, tags: toggled(filters.tags, name) });
  }

  function togglePlatform(platform: Platform) {
    onChange({ ...filters, platforms: toggled(filters.platforms, platform) });
  }

  return (
    <section
      aria-label="Filter the Shelf"
      className="bg-card flex flex-col gap-4 rounded-lg border p-4 sm:gap-5 sm:p-5"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor={searchId} className="text-sm">
          Search the Shelf by name
        </label>
        <input
          id={searchId}
          type="search"
          value={filters.search}
          onChange={(event) =>
            onChange({ ...filters, search: event.target.value })
          }
          placeholder="Hollow Knight"
          autoComplete="off"
          className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3 sm:max-w-md"
        />
      </div>

      {/* Phone screens are roughly one panel tall, so the controls would push
          every Discount below the fold. They collapse there and stay open
          from `sm` up, where there is room for both. The count on the button
          means nothing narrows the Shelf while out of sight. */}
      <Button
        variant="outline"
        size="sm"
        className="self-start sm:hidden"
        aria-expanded={showControls}
        aria-controls={controlsId}
        onClick={() => setShowControls((shown) => !shown)}
      >
        {showControls ? "Hide filters" : "Show filters"}
        {activeCount > 0 && ` (${activeCount} on)`}
      </Button>

      <div
        id={controlsId}
        className={cn(
          "flex-col gap-4 sm:flex sm:gap-5",
          showControls ? "flex" : "hidden",
        )}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
          <Field id={priceId} label="Maximum price">
            <Select
              id={priceId}
              value={filters.maxPrice === null ? "" : String(filters.maxPrice)}
              onChange={(value) =>
                onChange({
                  ...filters,
                  maxPrice: value === "" ? null : Number(value),
                })
              }
            >
              <option value="">Any price</option>
              {PRICE_CEILINGS.map((ceiling) => (
                <option key={ceiling} value={ceiling}>
                  {/* "or less", not "under": the ceiling is inclusive, so a
                      game priced at exactly it does match. */}
                  ${ceiling / 100} or less
                </option>
              ))}
            </Select>
          </Field>

          <Field id={depthId} label="Minimum discount">
            <Select
              id={depthId}
              value={String(filters.minDepth)}
              onChange={(value) =>
                onChange({ ...filters, minDepth: Number(value) })
              }
            >
              <option value="0">Any discount</option>
              {DEPTH_FLOORS.map((floor) => (
                <option key={floor} value={floor}>
                  {floor}% or more
                </option>
              ))}
            </Select>
          </Field>

          <fieldset>
            <legend className="mb-1.5 text-sm">Runs on</legend>
            {/* Matches the height of the selects beside it so the row sits on
                one baseline rather than stepping. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 sm:h-9">
              {PLATFORMS.map((platform) => (
                <label
                  key={platform}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={filters.platforms.includes(platform)}
                    onChange={() => togglePlatform(platform)}
                    className="accent-foreground focus-visible:ring-ring/50 size-4 outline-none focus-visible:ring-3"
                  />
                  {PLATFORM_NAMES[platform]}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        {(collapsedTags.length > 0 || filters.tags.length > 0) && (
          <div className="flex flex-col gap-2">
            <div
              id={tagsId}
              role="group"
              aria-label="Filter by tag or genre"
              className="flex flex-wrap gap-1.5"
            >
              {/* A selected tag carries no count. Every Discount still on
                  screen carries it, so its count is the headline count, and
                  printing that number twice only invites reading the second
                  one as something else. */}
              {filters.tags.map((name) => (
                <TagChip key={name} name={name} selected onToggle={toggleTag} />
              ))}
              {collapsedTags.map(({ name, count }) => (
                <TagChip
                  key={name}
                  name={name}
                  count={count}
                  onToggle={toggleTag}
                />
              ))}
            </div>

            {unselectedTags.length > TAGS_SHOWN && (
              <Button
                variant="link"
                size="sm"
                className="self-start px-0"
                aria-expanded={showAllTags}
                aria-controls={tagsId}
                onClick={() => setShowAllTags((shown) => !shown)}
              >
                {showAllTags
                  ? "Show fewer tags"
                  : `Show ${unselectedTags.length - TAGS_SHOWN} more tags`}
              </Button>
            )}
          </div>
        )}

      </div>

      {/* Outside the collapsible on purpose. With filters on and the panel
          shut on a phone, this is the only way back to the whole Shelf. */}
      <ClearFiltersButton
        className="self-start"
        disabled={!canClear}
        onClick={onClear}
      />
    </section>
  );
}

function TagChip({
  name,
  count,
  selected = false,
  onToggle,
}: {
  name: string;
  count?: number;
  selected?: boolean;
  onToggle: (name: string) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => onToggle(name)}
      className={cn(
        "focus-visible:ring-ring/50 rounded-full border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-3",
        selected
          ? "bg-primary text-primary-foreground border-transparent"
          : "hover:bg-muted",
      )}
    >
      {name}
      {count !== undefined && (
        <span className="text-muted-foreground tabular-nums"> {count}</span>
      )}
    </button>
  );
}

/** Adds a value to a selection, or takes it out if it is already there. */
function toggled<T>(selection: readonly T[], value: T): T[] {
  return selection.includes(value)
    ? selection.filter((each) => each !== value)
    : [...selection, value];
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm">
        {label}
      </label>
      {children}
    </div>
  );
}

function Select({
  id,
  value,
  onChange,
  children,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
    >
      {children}
    </select>
  );
}
