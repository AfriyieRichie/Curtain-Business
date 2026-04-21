/**
 * BOM Formula Engine — server-side copy.
 * Kept in sync with client/src/lib/bom-engine.ts (identical logic).
 * Pure functions, no side effects, 100% unit-tested.
 */

import Decimal from "decimal.js";

export interface BOMInput {
  widthCm: number;
  dropCm: number;
  fullnessRatio: number;
  fabricWidthCm: number;
}

export interface BOMLineItem {
  materialId: string;
  materialCode: string;
  description: string;
  formula: string;
  quantity: Decimal;
  unit: string;
  unitCostUsd: Decimal;
  unitCostGhs: Decimal;
  lineTotalUsd: Decimal;
  lineTotalGhs: Decimal;
}

export interface BOMResult {
  lines: BOMLineItem[];
  totalMaterialCostUsd: Decimal;
  totalMaterialCostGhs: Decimal;
  exchangeRateUsed: Decimal;
  suggestedSellingPriceGhs: Decimal;
}

export interface BOMTemplateLine {
  materialId: string;
  materialCode: string;
  description: string;
  quantityFormula: string;
  unit: string;
  unitCostUsd: Decimal | number | string;
  unitCostGhs: Decimal | number | string;
}

const ALLOWED_FORMULA_CHARS = /^[\d\s\+\-\*\/\(\)\.\,Math\.ceil\.floor\.round\.min\.max\_a-z]+$/i;

export function evaluateFormula(
  formula: string,
  input: BOMInput
): { quantity: Decimal; error?: string } {
  const widthM = input.widthCm / 100;
  const dropM = input.dropCm / 100;
  const fullnessRatio = input.fullnessRatio;
  const fabricWidthM = input.fabricWidthCm / 100;

  let resolved = formula
    .replace(/width_m/g, String(widthM))
    .replace(/drop_m/g, String(dropM))
    .replace(/fullness_ratio/g, String(fullnessRatio))
    .replace(/fabric_width_m/g, String(fabricWidthM));

  if (!ALLOWED_FORMULA_CHARS.test(resolved)) {
    return { quantity: new Decimal(0), error: `Invalid formula: ${formula}` };
  }

  try {
    const math = { ceil: Math.ceil, floor: Math.floor, round: Math.round, min: Math.min, max: Math.max };
    resolved = resolved.replace(/Math\.(ceil|floor|round|min|max)/g, (_, fn) => fn);
    // eslint-disable-next-line no-new-func
    const result = new Function(
      "ceil", "floor", "round", "min", "max",
      `"use strict"; return (${resolved});`
    )(math.ceil, math.floor, math.round, math.min, math.max);

    if (typeof result !== "number" || !isFinite(result) || result < 0) {
      return { quantity: new Decimal(0), error: `Formula produced invalid result: ${result}` };
    }
    return { quantity: new Decimal(result).toDecimalPlaces(4) };
  } catch {
    return { quantity: new Decimal(0), error: `Formula evaluation error: ${formula}` };
  }
}

export function calculateBOM(
  templateLines: BOMTemplateLine[],
  input: BOMInput,
  exchangeRate: Decimal | number | string,
  markupRatio: Decimal | number | string = 0.35
): BOMResult & { errors: string[] } {
  const rate = new Decimal(exchangeRate);
  const markup = new Decimal(markupRatio);
  const errors: string[] = [];
  const lines: BOMLineItem[] = [];

  for (const line of templateLines) {
    const { quantity, error } = evaluateFormula(line.quantityFormula, input);
    if (error) errors.push(error);

    const unitCostUsd = new Decimal(line.unitCostUsd);
    const unitCostGhs = new Decimal(line.unitCostGhs);
    const lineTotalUsd = unitCostUsd.mul(quantity).toDecimalPlaces(4);
    const lineTotalGhs = unitCostGhs.mul(quantity).toDecimalPlaces(4);

    lines.push({
      materialId: line.materialId,
      materialCode: line.materialCode,
      description: line.description,
      formula: line.quantityFormula,
      quantity,
      unit: line.unit,
      unitCostUsd,
      unitCostGhs,
      lineTotalUsd,
      lineTotalGhs,
    });
  }

  const totalMaterialCostUsd = lines
    .reduce((sum, l) => sum.plus(l.lineTotalUsd), new Decimal(0))
    .toDecimalPlaces(4);

  const totalMaterialCostGhs = lines
    .reduce((sum, l) => sum.plus(l.lineTotalGhs), new Decimal(0))
    .toDecimalPlaces(4);

  const suggestedSellingPriceGhs = totalMaterialCostGhs
    .mul(new Decimal(1).plus(markup))
    .toDecimalPlaces(4);

  return { lines, totalMaterialCostUsd, totalMaterialCostGhs, exchangeRateUsed: rate, suggestedSellingPriceGhs, errors };
}

export function serializeBOMSnapshot(result: BOMResult): Record<string, unknown> {
  return {
    lines: result.lines.map((l) => ({
      materialId: l.materialId,
      materialCode: l.materialCode,
      description: l.description,
      formula: l.formula,
      quantity: l.quantity.toString(),
      unit: l.unit,
      unitCostUsd: l.unitCostUsd.toString(),
      unitCostGhs: l.unitCostGhs.toString(),
      lineTotalUsd: l.lineTotalUsd.toString(),
      lineTotalGhs: l.lineTotalGhs.toString(),
    })),
    totalMaterialCostUsd: result.totalMaterialCostUsd.toString(),
    totalMaterialCostGhs: result.totalMaterialCostGhs.toString(),
    exchangeRateUsed: result.exchangeRateUsed.toString(),
    suggestedSellingPriceGhs: result.suggestedSellingPriceGhs.toString(),
  };
}
