import { describe, it, expect } from "vitest";
import Decimal from "decimal.js";
import { formatGHS, formatUSD, convertUSDtoGHS, convertGHStoUSD, recalculateGHSCost } from "../currency";

describe("formatGHS", () => {
  it("formats with GHS prefix and 2 decimals", () => {
    expect(formatGHS(1000)).toBe("GHS 1,000.00");
  });
  it("formats without symbol when showSymbol=false", () => {
    expect(formatGHS(500.5, false)).toBe("500.50");
  });
  it("handles Decimal input", () => {
    expect(formatGHS(new Decimal("12345.678"))).toBe("GHS 12,345.68");
  });
});

describe("formatUSD", () => {
  it("formats with USD prefix", () => {
    expect(formatUSD(99.9)).toBe("USD 99.90");
  });
});

describe("convertUSDtoGHS", () => {
  it("multiplies by rate", () => {
    const result = convertUSDtoGHS("10", "15.5");
    expect(result.toNumber()).toBe(155);
  });
  it("handles Decimal inputs", () => {
    const result = convertUSDtoGHS(new Decimal("2.5"), new Decimal("16"));
    expect(result.toNumber()).toBe(40);
  });
});

describe("convertGHStoUSD", () => {
  it("divides by rate", () => {
    const result = convertGHStoUSD("155", "15.5");
    expect(result.toNumber()).toBe(10);
  });
  it("returns zero when rate is zero", () => {
    expect(convertGHStoUSD("100", "0").toNumber()).toBe(0);
  });
});

describe("recalculateGHSCost", () => {
  it("converts USD cost to GHS at new rate", () => {
    const ghs = recalculateGHSCost("5", "16.2");
    expect(ghs.toNumber()).toBeCloseTo(81, 5);
  });
});
