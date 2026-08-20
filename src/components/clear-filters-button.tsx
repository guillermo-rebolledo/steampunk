"use client";

import { Button } from "@/components/ui/button";

/**
 * The one action that puts the whole Shelf back.
 *
 * It appears twice — in the filter panel and in the empty state — and the two
 * have to say the same thing, because a visitor who reads one and then meets
 * the other should not have to work out whether they do the same thing.
 */
export function ClearFiltersButton({
  onClick,
  disabled,
  className,
}: {
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={className}
      disabled={disabled}
      onClick={onClick}
    >
      Clear filters and search
    </Button>
  );
}
