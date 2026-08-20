import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("cn", () => {
  it("resolves conflicting Tailwind utilities in favour of the last one", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("drops falsy values so conditional classes can be passed inline", () => {
    expect(cn("rounded", false && "hidden", undefined, "border")).toBe(
      "rounded border",
    );
  });
});
