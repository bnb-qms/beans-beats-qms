import { describe, expect, it } from "vitest";
import { formatPrice } from "./format-price";

describe("formatPrice", () => {
  it("formats whole dollars", () => {
    expect(formatPrice(800)).toBe("S$8.00");
  });

  it("formats cents", () => {
    expect(formatPrice(350)).toBe("S$3.50");
  });
});
