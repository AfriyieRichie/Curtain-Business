import Decimal from "decimal.js";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function convertUSDtoGHS(
  usd: Decimal | number | string,
  rate: Decimal | number | string
): Decimal {
  return new Decimal(usd).mul(new Decimal(rate)).toDecimalPlaces(6);
}

export function recalcGHSCost(
  unitCostUsd: Decimal | number | string,
  newRate: Decimal | number | string
): Decimal {
  return new Decimal(unitCostUsd).mul(new Decimal(newRate)).toDecimalPlaces(6);
}

export function applyMarkup(
  cost: Decimal | number | string,
  markupRatio: Decimal | number | string
): Decimal {
  return new Decimal(cost).mul(new Decimal(1).plus(new Decimal(markupRatio))).toDecimalPlaces(4);
}

/** Safely create a Prisma-compatible Decimal string from any input */
export function d(value: Decimal | number | string): string {
  return new Decimal(value).toString();
}
