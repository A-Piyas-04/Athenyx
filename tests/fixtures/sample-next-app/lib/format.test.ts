import { describe, expect, it } from "vitest";
import { formatCurrency } from "./format";

describe("formatCurrency", () => {
  it("formats dollars", () => {
    expect(formatCurrency(5)).toBe("$5.00");
  });
});
