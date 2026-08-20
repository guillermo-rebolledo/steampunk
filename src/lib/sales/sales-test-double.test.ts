import { describe, expect, it } from "vitest";

import { parseSaleWindow } from "@/lib/sales/parse-sale-page";
import {
  capturedSalePage,
  withEventFields,
  withEventsBefore,
} from "@/lib/sales/sales-test-double";

/**
 * The fixture helpers decode Steam's partner event record, patch it and encode
 * it again. That round trip is small but not trivial, and a fixture that
 * corrupts the record quietly looks exactly like a parser bug — so it is held
 * to the same standard as the parser it feeds.
 */
describe("editing the captured event record", () => {
  it("leaves the record as captured when nothing is changed", () => {
    expect(parseSaleWindow(withEventsBefore([]))).toEqual(
      parseSaleWindow(capturedSalePage),
    );
  });

  // Every one of these breaks a regex-based edit in its own way: `$&` and `$1`
  // are replacement syntax, `&` opens an entity, and a comma inside a string
  // ends the value as far as a naive pattern is concerned.
  it("writes a value verbatim, whatever is in it", () => {
    const awkward = "$& R&D, soon $1 <hi> 'x' \"y\"";

    expect(parseSaleWindow(withEventFields({ event_name: awkward }))?.name).toBe(
      awkward,
    );
  });

  it("refuses a field the capture no longer has", () => {
    expect(() => withEventFields({ nope: 1 })).toThrow(/no longer has a nope/);
  });
});
