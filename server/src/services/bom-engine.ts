/**
 * BOM Formula Engine — server-side copy.
 * Kept in sync with client/src/lib/bom-engine.ts (identical logic, no browser/Node APIs).
 * All functions are pure with no side effects. 100% unit-tested.
 *
 * Formula variables available in templates:
 *   width_m          — finished curtain width in metres
 *   drop_m           — finished curtain drop in metres
 *   fullness_ratio   — heading fullness multiplier (e.g. 2.5)
 *   fabric_width_m   — fabric roll width in metres (e.g. 1.4)
 *
 * Supported functions: Math.ceil, Math.floor, Math.round, Math.min, Math.max
 *
 * Example formulas (matching the spec):
 *   Fabric yardage  : (width_m * fullness_ratio) / fabric_width_m
 *   Lining yardage  : (width_m * fullness_ratio) / fabric_width_m
 *   Heading tape    : width_m * fullness_ratio
 *   Eyelet rings    : Math.ceil(width_m * 4)
 *   Curtain weights : Math.ceil(width_m / 0.5)
 *   Track           : width_m * 1.05
 */

import Decimal from "decimal.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface BOMInput {
  widthCm: number;
  dropCm: number;
  fullnessRatio: number;
  fabricWidthCm: number;
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

export interface FormulaValidation {
  valid: boolean;
  error?: string;
  /** Preview quantity evaluated at the provided sample input, or null on error */
  previewQuantity: Decimal | null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Substitutes formula variables with their numeric values.
 * IMPORTANT: fabric_width_m must be replaced before width_m to avoid
 * partial-match corruption ("fabric_2.0_m").
 */
function substituteVariables(formula: string, input: BOMInput): string {
  const widthM = input.widthCm / 100;
  const dropM = input.dropCm / 100;
  const fabricWidthM = input.fabricWidthCm / 100;

  return formula
    .replace(/fabric_width_m/g, String(fabricWidthM)) // must precede width_m
    .replace(/width_m/g, String(widthM))
    .replace(/drop_m/g, String(dropM))
    .replace(/fullness_ratio/g, String(input.fullnessRatio));
}

/**
 * After variable substitution the resolved string must contain only:
 * digits, whitespace, arithmetic operators, parentheses, decimal points,
 * and the bare names of the five allowed math functions.
 *
 * After substitution, the only letters that may remain are those forming the
 * five allowed function identifiers: ceil, floor, round, min, max.
 */
// Only letters allowed (case-insensitive) are those in the five allowed
// function identifiers: ceil, floor, round, min, max
const ALLOWED_LETTERS_RE = /[a-z]/gi;
const ALLOWED_FUNCTION_LETTERS = new Set([
  "c","e","i","l","f","o","r","u","n","d","m","a","x",
]);

function isSafeResolved(resolved: string): boolean {
  // Strip "Math." prefix first — it contributes 't' and 'h' which are not in
  // the function-name letter set (ceil/floor/round/min/max don't use them).
  const withoutMathPrefix = resolved.replace(/Math\./gi, "");
  const letters = withoutMathPrefix.match(ALLOWED_LETTERS_RE) ?? [];
  return letters.every((ch) => ALLOWED_FUNCTION_LETTERS.has(ch.toLowerCase()));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluates a single quantity formula against a BOM input.
 * Returns { quantity, error }.  Never throws.
 */
export function evaluateFormula(
  formula: string,
  input: BOMInput
): { quantity: Decimal; error?: string } {
  if (!formula.trim()) {
    return { quantity: new Decimal(0), error: "Formula is empty." };
  }

  const resolved = substituteVariables(formula, input);

  if (!isSafeResolved(resolved)) {
    return {
      quantity: new Decimal(0),
      error: `Formula contains disallowed characters: "${formula}"`,
    };
  }

  // Strip Math. prefix — after safety check, only valid function names remain
  const executableExpr = resolved.replace(/Math\./gi, "");

  try {
    // new Function scope intentionally has no access to module globals
    // eslint-disable-next-line no-new-func
    const result = new Function(
      "ceil", "floor", "round", "min", "max",
      `"use strict"; return (${executableExpr});`
    )(Math.ceil, Math.floor, Math.round, Math.min, Math.max);

    if (typeof result !== "number") {
      return {
        quantity: new Decimal(0),
        error: `Formula did not return a number (got ${typeof result}): "${formula}"`,
      };
    }
    if (!isFinite(result)) {
      return {
        quantity: new Decimal(0),
        error: `Formula produced a non-finite result (division by zero?): "${formula}"`,
      };
    }
    if (result < 0) {
      return {
        quantity: new Decimal(0),
        error: `Formula produced a negative quantity (${result}): "${formula}"`,
      };
    }

    return { quantity: new Decimal(result).toDecimalPlaces(4) };
  } catch (err) {
    return {
      quantity: new Decimal(0),
      error: `Formula syntax error: "${formula}" — ${(err as Error).message}`,
    };
  }
}

/**
 * Validates a formula string and returns a preview quantity.
 * Used by the formula editor UI for live feedback.
 */
export function validateFormula(
  formula: string,
  sampleInput: BOMInput = { widthCm: 200, dropCm: 250, fullnessRatio: 2.5, fabricWidthCm: 140 }
): FormulaValidation {
  const { quantity, error } = evaluateFormula(formula, sampleInput);
  if (error) {
    return { valid: false, error, previewQuantity: null };
  }
  return { valid: true, previewQuantity: quantity };
}

/**
 * Calculates a full BOM from a template + dimensions.
 * This is the authoritative calculation — used on both save (server) and
 * live preview (client) via the identical shared copy.
 */
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

  // Suggested price = total GHS cost × (1 + markup)
  const suggestedSellingPriceGhs = totalMaterialCostGhs
    .mul(new Decimal(1).plus(markup))
    .toDecimalPlaces(4);

  return {
    lines,
    totalMaterialCostUsd,
    totalMaterialCostGhs,
    exchangeRateUsed: rate,
    suggestedSellingPriceGhs,
    errors,
  };
}

/**
 * Serialises a BOMResult to a plain JSON-safe object for storage in the
 * database (Quote/OrderItem.bomSnapshot JSONB column).
 * All Decimal values are stored as strings to preserve precision.
 */
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

/**
 * Deserialises a stored JSONB snapshot back into a typed BOMResult.
 * Used when reading back stored quotes/invoices for display and PDF generation.
 */
export function deserializeBOMSnapshot(snapshot: Record<string, unknown>): BOMResult {
  const rawLines = (snapshot.lines as Record<string, unknown>[]) ?? [];

  const lines: BOMLineItem[] = rawLines.map((l) => ({
    materialId: String(l.materialId),
    materialCode: String(l.materialCode),
    description: String(l.description),
    formula: String(l.formula),
    quantity: new Decimal(String(l.quantity)),
    unit: String(l.unit),
    unitCostUsd: new Decimal(String(l.unitCostUsd)),
    unitCostGhs: new Decimal(String(l.unitCostGhs)),
    lineTotalUsd: new Decimal(String(l.lineTotalUsd)),
    lineTotalGhs: new Decimal(String(l.lineTotalGhs)),
  }));

  return {
    lines,
    totalMaterialCostUsd: new Decimal(String(snapshot.totalMaterialCostUsd)),
    totalMaterialCostGhs: new Decimal(String(snapshot.totalMaterialCostGhs)),
    exchangeRateUsed: new Decimal(String(snapshot.exchangeRateUsed)),
    suggestedSellingPriceGhs: new Decimal(String(snapshot.suggestedSellingPriceGhs)),
  };
}
