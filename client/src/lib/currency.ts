import Decimal from "decimal.js";

// Configure Decimal for financial precision
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function formatGHS(amount: Decimal | number | string, showSymbol = true): string {
  const value = new Decimal(amount);
  const formatted = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return showSymbol ? `GHS ${formatted}` : formatted;
}

export function formatUSD(amount: Decimal | number | string, showSymbol = true): string {
  const value = new Decimal(amount);
  const formatted = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return showSymbol ? `USD ${formatted}` : formatted;
}

export function convertUSDtoGHS(
  amountUsd: Decimal | number | string,
  rate: Decimal | number | string
): Decimal {
  return new Decimal(amountUsd).mul(new Decimal(rate)).toDecimalPlaces(4);
}

export function convertGHStoUSD(
  amountGhs: Decimal | number | string,
  rate: Decimal | number | string
): Decimal {
  const r = new Decimal(rate);
  if (r.isZero()) return new Decimal(0);
  return new Decimal(amountGhs).div(r).toDecimalPlaces(4);
}

export function recalculateGHSCost(
  unitCostUsd: Decimal | number | string,
  newRate: Decimal | number | string
): Decimal {
  return convertUSDtoGHS(unitCostUsd, newRate).toDecimalPlaces(6);
}

/** Formats a number as a plain string with comma separators (no currency symbol) */
export function formatNumber(value: Decimal | number | string, decimals = 2): string {
  return new Decimal(value).toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
