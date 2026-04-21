/**
 * BOM Engine — full unit test suite.
 * Target: 100% branch/line/function/statement coverage on bom-engine.ts
 */

import Decimal from "decimal.js";
import {
  evaluateFormula,
  validateFormula,
  calculateBOM,
  serializeBOMSnapshot,
  deserializeBOMSnapshot,
} from "../bom-engine";
import type { BOMInput, BOMTemplateLine, BOMResult } from "../bom-engine";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const BASE_INPUT: BOMInput = {
  widthCm: 200,
  dropCm: 250,
  fullnessRatio: 2.5,
  fabricWidthCm: 150,
};

// All example formulas from the spec
const SPEC_FORMULAS = {
  fabric: "(width_m * fullness_ratio) / fabric_width_m",
  lining: "(width_m * fullness_ratio) / fabric_width_m",
  headingTape: "width_m * fullness_ratio",
  eyeletRings: "Math.ceil(width_m * 4)",
  curtainWeights: "Math.ceil(width_m / 0.5)",
  track: "width_m * 1.05",
};

const TEMPLATE_LINES: BOMTemplateLine[] = [
  {
    materialId: "mat-1",
    materialCode: "FAB-001",
    description: "Main Fabric",
    quantityFormula: SPEC_FORMULAS.fabric,
    unit: "METER",
    unitCostUsd: "12.50",
    unitCostGhs: "193.75",
  },
  {
    materialId: "mat-2",
    materialCode: "HT-001",
    description: "Heading Tape",
    quantityFormula: SPEC_FORMULAS.headingTape,
    unit: "METER",
    unitCostUsd: "0.80",
    unitCostGhs: "12.40",
  },
  {
    materialId: "mat-3",
    materialCode: "EYE-001",
    description: "Eyelet Rings",
    quantityFormula: SPEC_FORMULAS.eyeletRings,
    unit: "PIECE",
    unitCostUsd: "0.25",
    unitCostGhs: "3.875",
  },
];

// ── evaluateFormula ───────────────────────────────────────────────────────────

describe("evaluateFormula", () => {
  describe("all spec example formulas", () => {
    it("fabric / lining: (width_m * fullness_ratio) / fabric_width_m", () => {
      // (2.0 * 2.5) / 1.5 = 3.3333...
      const { quantity, error } = evaluateFormula(SPEC_FORMULAS.fabric, BASE_INPUT);
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBeCloseTo(3.3333, 3);
    });

    it("heading tape: width_m * fullness_ratio", () => {
      // 2.0 * 2.5 = 5.0
      const { quantity, error } = evaluateFormula(SPEC_FORMULAS.headingTape, BASE_INPUT);
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBe(5);
    });

    it("eyelet rings: Math.ceil(width_m * 4)", () => {
      // ceil(2.0 * 4) = 8
      const { quantity, error } = evaluateFormula(SPEC_FORMULAS.eyeletRings, BASE_INPUT);
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBe(8);
    });

    it("curtain weights: Math.ceil(width_m / 0.5)", () => {
      // ceil(2.0 / 0.5) = 4
      const { quantity, error } = evaluateFormula(SPEC_FORMULAS.curtainWeights, BASE_INPUT);
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBe(4);
    });

    it("track with 5% overlap: width_m * 1.05", () => {
      // 2.0 * 1.05 = 2.1
      const { quantity, error } = evaluateFormula(SPEC_FORMULAS.track, BASE_INPUT);
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBeCloseTo(2.1, 4);
    });
  });

  describe("variable substitution correctness", () => {
    it("uses fabric_width_m independently from width_m", () => {
      // Critical regression test for the substitution-order bug.
      // If width_m is substituted first, "fabric_width_m" becomes "fabric_2.0_m"
      // and the fabric_width_m substitution fails silently.
      const input: BOMInput = { widthCm: 300, dropCm: 200, fullnessRatio: 2.0, fabricWidthCm: 140 };
      const { quantity, error } = evaluateFormula(
        "(width_m * fullness_ratio) / fabric_width_m",
        input
      );
      // (3.0 * 2.0) / 1.4 = 4.2857...
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBeCloseTo(4.2857, 3);
    });

    it("uses drop_m correctly", () => {
      const { quantity, error } = evaluateFormula("drop_m + 0.3", BASE_INPUT);
      // 2.5 + 0.3 = 2.8
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBeCloseTo(2.8, 4);
    });

    it("uses all four variables together (roman blind)", () => {
      // (width_m + 0.1) * (drop_m + 0.3)
      const { quantity, error } = evaluateFormula(
        "(width_m + 0.1) * (drop_m + 0.3)",
        BASE_INPUT
      );
      // (2.0 + 0.1) * (2.5 + 0.3) = 2.1 * 2.8 = 5.88
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBeCloseTo(5.88, 4);
    });
  });

  describe("all supported Math functions", () => {
    it("Math.floor rounds down", () => {
      const { quantity } = evaluateFormula("Math.floor(width_m * 1.7)", BASE_INPUT);
      // floor(2.0 * 1.7) = floor(3.4) = 3
      expect(quantity.toNumber()).toBe(3);
    });

    it("Math.round rounds to nearest", () => {
      const { quantity } = evaluateFormula("Math.round(width_m * 1.7)", BASE_INPUT);
      // round(3.4) = 3
      expect(quantity.toNumber()).toBe(3);
    });

    it("Math.round rounds up at .5", () => {
      const { quantity } = evaluateFormula("Math.round(width_m * 1.75)", BASE_INPUT);
      // round(2.0 * 1.75) = round(3.5) = 4
      expect(quantity.toNumber()).toBe(4);
    });

    it("Math.min returns the smaller of two values", () => {
      const { quantity } = evaluateFormula("Math.min(width_m, drop_m)", BASE_INPUT);
      // min(2.0, 2.5) = 2.0
      expect(quantity.toNumber()).toBe(2.0);
    });

    it("Math.max returns the larger of two values", () => {
      const { quantity } = evaluateFormula("Math.max(width_m, drop_m)", BASE_INPUT);
      // max(2.0, 2.5) = 2.5
      expect(quantity.toNumber()).toBe(2.5);
    });
  });

  describe("error cases", () => {
    it("returns error for empty formula", () => {
      const { quantity, error } = evaluateFormula("", BASE_INPUT);
      expect(error).toBeDefined();
      expect(error).toContain("empty");
      expect(quantity.toNumber()).toBe(0);
    });

    it("returns error for whitespace-only formula", () => {
      const { quantity, error } = evaluateFormula("   ", BASE_INPUT);
      expect(error).toBeDefined();
      expect(quantity.toNumber()).toBe(0);
    });

    it("returns error for code injection attempt (require)", () => {
      const { error } = evaluateFormula("require('fs')", BASE_INPUT);
      expect(error).toBeDefined();
      expect(error).toContain("disallowed");
    });

    it("returns error for code injection attempt (process)", () => {
      const { error } = evaluateFormula("process.exit(1)", BASE_INPUT);
      expect(error).toBeDefined();
    });

    it("returns error for negative result", () => {
      const { quantity, error } = evaluateFormula("width_m - 100", BASE_INPUT);
      expect(quantity.toNumber()).toBe(0);
      expect(error).toContain("negative");
    });

    it("returns error for division by zero (Infinity)", () => {
      // fabric_width_m of 0 → division by zero
      const input: BOMInput = { ...BASE_INPUT, fabricWidthCm: 0 };
      const { quantity, error } = evaluateFormula(
        "(width_m * fullness_ratio) / fabric_width_m",
        input
      );
      expect(quantity.toNumber()).toBe(0);
      expect(error).toContain("non-finite");
    });

    it("returns error for genuine syntax error in formula", () => {
      // An unclosed parenthesis is a guaranteed SyntaxError in new Function
      const { quantity, error } = evaluateFormula("(width_m + ", BASE_INPUT);
      expect(quantity.toNumber()).toBe(0);
      expect(error).toBeDefined();
      expect(error).toContain("syntax error");
    });

    it("returns error when formula evaluates to a non-number (string)", () => {
      // After variable substitution this resolves to just a letter sequence
      // that is in the allowed set but evaluates to undefined (bare identifier)
      // Covered by the typeof result !== "number" branch
      const { quantity, error } = evaluateFormula("min", BASE_INPUT);
      // min with no args returns Infinity which hits the isFinite check,
      // but "min" as a bare expression actually returns the function reference
      // typeof function !== "number"
      expect(quantity.toNumber()).toBe(0);
      expect(error).toBeDefined();
    });

    it("returns zero quantity (not throws) for formula = '0'", () => {
      const { quantity, error } = evaluateFormula("0", BASE_INPUT);
      expect(error).toBeUndefined();
      expect(quantity.toNumber()).toBe(0);
    });
  });

  describe("Decimal precision", () => {
    it("result is truncated to 4 decimal places", () => {
      // (2.0 * 2.5) / 1.5 = 3.333333... → 3.3333
      const { quantity } = evaluateFormula(SPEC_FORMULAS.fabric, BASE_INPUT);
      const decimalPlaces = quantity.toString().split(".")[1]?.length ?? 0;
      expect(decimalPlaces).toBeLessThanOrEqual(4);
    });
  });
});

// ── validateFormula ───────────────────────────────────────────────────────────

describe("validateFormula", () => {
  it("returns valid=true and a preview quantity for a good formula", () => {
    const result = validateFormula("width_m * fullness_ratio");
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.previewQuantity).not.toBeNull();
    // default sample: widthCm=200, fullness=2.5 → 2.0 * 2.5 = 5
    expect(result.previewQuantity?.toNumber()).toBe(5);
  });

  it("returns valid=false and error for an empty formula", () => {
    const result = validateFormula("");
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.previewQuantity).toBeNull();
  });

  it("returns valid=false for injection attempt", () => {
    const result = validateFormula("fetch('/api/hack')");
    expect(result.valid).toBe(false);
    expect(result.previewQuantity).toBeNull();
  });

  it("accepts a custom sample input for the preview", () => {
    const custom: BOMInput = { widthCm: 300, dropCm: 300, fullnessRatio: 2.0, fabricWidthCm: 140 };
    const result = validateFormula("width_m * fullness_ratio", custom);
    expect(result.valid).toBe(true);
    // 3.0 * 2.0 = 6.0
    expect(result.previewQuantity?.toNumber()).toBe(6.0);
  });
});

// ── calculateBOM ──────────────────────────────────────────────────────────────

describe("calculateBOM", () => {
  const RATE = new Decimal("15.50");

  it("produces correct line items for all spec formulas", () => {
    const result = calculateBOM(TEMPLATE_LINES, BASE_INPUT, RATE);
    expect(result.errors).toHaveLength(0);
    expect(result.lines).toHaveLength(3);

    // Fabric line: qty ≈ 3.3333
    expect(result.lines[0].quantity.toNumber()).toBeCloseTo(3.3333, 3);
    expect(result.lines[0].lineTotalUsd.toNumber()).toBeCloseTo(3.3333 * 12.5, 2);

    // Heading tape: qty = 5
    expect(result.lines[1].quantity.toNumber()).toBe(5);
    expect(result.lines[1].lineTotalGhs.toNumber()).toBeCloseTo(5 * 12.4, 4);

    // Eyelet rings: qty = 8 (ceil(2.0 * 4))
    expect(result.lines[2].quantity.toNumber()).toBe(8);
    expect(result.lines[2].lineTotalUsd.toNumber()).toBeCloseTo(8 * 0.25, 4);
  });

  it("total USD cost equals sum of all USD line totals", () => {
    const result = calculateBOM(TEMPLATE_LINES, BASE_INPUT, RATE);
    const expected = result.lines.reduce((s, l) => s.plus(l.lineTotalUsd), new Decimal(0));
    expect(result.totalMaterialCostUsd.toString()).toBe(
      expected.toDecimalPlaces(4).toString()
    );
  });

  it("total GHS cost equals sum of all GHS line totals", () => {
    const result = calculateBOM(TEMPLATE_LINES, BASE_INPUT, RATE);
    const expected = result.lines.reduce((s, l) => s.plus(l.lineTotalGhs), new Decimal(0));
    expect(result.totalMaterialCostGhs.toString()).toBe(
      expected.toDecimalPlaces(4).toString()
    );
  });

  it("suggested selling price = totalGHS × (1 + markup) with default 35% markup", () => {
    const result = calculateBOM(TEMPLATE_LINES, BASE_INPUT, RATE);
    const expected = result.totalMaterialCostGhs.mul("1.35").toDecimalPlaces(4);
    expect(result.suggestedSellingPriceGhs.toString()).toBe(expected.toString());
  });

  it("uses a custom markup ratio correctly", () => {
    const result = calculateBOM(TEMPLATE_LINES, BASE_INPUT, RATE, "0.50");
    const expected = result.totalMaterialCostGhs.mul("1.50").toDecimalPlaces(4);
    expect(result.suggestedSellingPriceGhs.toString()).toBe(expected.toString());
  });

  it("snapshots the exchange rate used", () => {
    const result = calculateBOM(TEMPLATE_LINES, BASE_INPUT, "16.20");
    expect(result.exchangeRateUsed.toString()).toBe("16.2");
  });

  it("accepts Decimal inputs for rate and markup", () => {
    const result = calculateBOM(
      TEMPLATE_LINES,
      BASE_INPUT,
      new Decimal("15.50"),
      new Decimal("0.35")
    );
    expect(result.errors).toHaveLength(0);
  });

  it("accepts number inputs for rate and markup", () => {
    const result = calculateBOM(TEMPLATE_LINES, BASE_INPUT, 15.5, 0.35);
    expect(result.errors).toHaveLength(0);
  });

  it("returns zero totals for an empty template", () => {
    const result = calculateBOM([], BASE_INPUT, RATE);
    expect(result.lines).toHaveLength(0);
    expect(result.totalMaterialCostUsd.toNumber()).toBe(0);
    expect(result.totalMaterialCostGhs.toNumber()).toBe(0);
    expect(result.suggestedSellingPriceGhs.toNumber()).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it("collects errors from bad formulas without throwing, still returns zero qty line", () => {
    const badLines: BOMTemplateLine[] = [
      { ...TEMPLATE_LINES[0], quantityFormula: "eval('bad')" },
      TEMPLATE_LINES[1], // good line should still be calculated
    ];
    const result = calculateBOM(badLines, BASE_INPUT, RATE);
    expect(result.errors).toHaveLength(1);
    expect(result.lines).toHaveLength(2);
    // The bad line has qty=0, the good line still calculates
    expect(result.lines[0].quantity.toNumber()).toBe(0);
    expect(result.lines[1].quantity.toNumber()).toBe(5);
  });

  it("does not mutate the exchange rate after calculation", () => {
    const rate = new Decimal("15.50");
    calculateBOM(TEMPLATE_LINES, BASE_INPUT, rate);
    expect(rate.toString()).toBe("15.5"); // Decimal is immutable — just verifying
  });

  it("fabric_width_m substitution works correctly (regression for substitution order bug)", () => {
    const lines: BOMTemplateLine[] = [
      {
        materialId: "m1",
        materialCode: "F001",
        description: "Fabric",
        quantityFormula: "(width_m * fullness_ratio) / fabric_width_m",
        unit: "METER",
        unitCostUsd: "10",
        unitCostGhs: "155",
      },
    ];
    const input: BOMInput = { widthCm: 280, dropCm: 240, fullnessRatio: 2.5, fabricWidthCm: 140 };
    const result = calculateBOM(lines, input, "15.5");
    // (2.8 * 2.5) / 1.4 = 7.0 / 1.4 = 5.0
    expect(result.errors).toHaveLength(0);
    expect(result.lines[0].quantity.toNumber()).toBeCloseTo(5.0, 4);
  });
});

// ── serializeBOMSnapshot ──────────────────────────────────────────────────────

describe("serializeBOMSnapshot", () => {
  function buildResult(): BOMResult & { errors: string[] } {
    return calculateBOM(
      [
        {
          materialId: "m1",
          materialCode: "F-001",
          description: "Fabric",
          quantityFormula: "width_m * fullness_ratio",
          unit: "METER",
          unitCostUsd: "10",
          unitCostGhs: "155",
        },
      ],
      BASE_INPUT,
      "15.5"
    );
  }

  it("all top-level monetary fields are strings", () => {
    const snapshot = serializeBOMSnapshot(buildResult());
    expect(typeof snapshot.totalMaterialCostUsd).toBe("string");
    expect(typeof snapshot.totalMaterialCostGhs).toBe("string");
    expect(typeof snapshot.exchangeRateUsed).toBe("string");
    expect(typeof snapshot.suggestedSellingPriceGhs).toBe("string");
  });

  it("all line-level monetary fields are strings", () => {
    const snapshot = serializeBOMSnapshot(buildResult());
    const line = (snapshot.lines as Record<string, unknown>[])[0];
    expect(typeof line.quantity).toBe("string");
    expect(typeof line.unitCostUsd).toBe("string");
    expect(typeof line.unitCostGhs).toBe("string");
    expect(typeof line.lineTotalUsd).toBe("string");
    expect(typeof line.lineTotalGhs).toBe("string");
  });

  it("preserves all non-monetary line fields", () => {
    const snapshot = serializeBOMSnapshot(buildResult());
    const line = (snapshot.lines as Record<string, unknown>[])[0];
    expect(line.materialId).toBe("m1");
    expect(line.materialCode).toBe("F-001");
    expect(line.description).toBe("Fabric");
    expect(line.unit).toBe("METER");
  });

  it("produces an empty lines array for an empty BOM result", () => {
    const emptyResult = calculateBOM([], BASE_INPUT, "15.5");
    const snapshot = serializeBOMSnapshot(emptyResult);
    expect(snapshot.lines).toEqual([]);
    expect(snapshot.totalMaterialCostUsd).toBe("0");
    expect(snapshot.totalMaterialCostGhs).toBe("0");
  });

  it("values are JSON-safe (no Decimal objects survive)", () => {
    const snapshot = serializeBOMSnapshot(buildResult());
    expect(() => JSON.stringify(snapshot)).not.toThrow();
  });
});

// ── deserializeBOMSnapshot ────────────────────────────────────────────────────

describe("deserializeBOMSnapshot", () => {
  it("round-trips through serialize → deserialize preserving values", () => {
    const original = calculateBOM(TEMPLATE_LINES, BASE_INPUT, "15.50");
    const snapshot = serializeBOMSnapshot(original);
    const restored = deserializeBOMSnapshot(snapshot);

    expect(restored.totalMaterialCostUsd.toString()).toBe(
      original.totalMaterialCostUsd.toString()
    );
    expect(restored.totalMaterialCostGhs.toString()).toBe(
      original.totalMaterialCostGhs.toString()
    );
    expect(restored.exchangeRateUsed.toString()).toBe(
      original.exchangeRateUsed.toString()
    );
    expect(restored.suggestedSellingPriceGhs.toString()).toBe(
      original.suggestedSellingPriceGhs.toString()
    );
  });

  it("restored lines have Decimal instances (not strings)", () => {
    const original = calculateBOM(TEMPLATE_LINES, BASE_INPUT, "15.50");
    const restored = deserializeBOMSnapshot(serializeBOMSnapshot(original));
    for (const line of restored.lines) {
      expect(line.quantity).toBeInstanceOf(Decimal);
      expect(line.unitCostUsd).toBeInstanceOf(Decimal);
      expect(line.unitCostGhs).toBeInstanceOf(Decimal);
      expect(line.lineTotalUsd).toBeInstanceOf(Decimal);
      expect(line.lineTotalGhs).toBeInstanceOf(Decimal);
    }
  });

  it("restored line count matches original", () => {
    const original = calculateBOM(TEMPLATE_LINES, BASE_INPUT, "15.50");
    const restored = deserializeBOMSnapshot(serializeBOMSnapshot(original));
    expect(restored.lines).toHaveLength(original.lines.length);
  });

  it("handles empty lines array gracefully", () => {
    const emptyResult = calculateBOM([], BASE_INPUT, "15.5");
    const snapshot = serializeBOMSnapshot(emptyResult);
    const restored = deserializeBOMSnapshot(snapshot);
    expect(restored.lines).toHaveLength(0);
    expect(restored.totalMaterialCostUsd.toNumber()).toBe(0);
  });

  it("falls back to empty array when snapshot.lines is undefined (??  branch)", () => {
    const partialSnapshot = {
      // lines intentionally omitted to exercise the ?? [] fallback
      totalMaterialCostUsd: "0",
      totalMaterialCostGhs: "0",
      exchangeRateUsed: "15.5",
      suggestedSellingPriceGhs: "0",
    } as Record<string, unknown>;
    const restored = deserializeBOMSnapshot(partialSnapshot);
    expect(restored.lines).toHaveLength(0);
  });

  it("preserves string fields (materialId, materialCode, description, formula, unit)", () => {
    const original = calculateBOM(TEMPLATE_LINES, BASE_INPUT, "15.50");
    const restored = deserializeBOMSnapshot(serializeBOMSnapshot(original));
    for (let i = 0; i < TEMPLATE_LINES.length; i++) {
      expect(restored.lines[i].materialId).toBe(TEMPLATE_LINES[i].materialId);
      expect(restored.lines[i].materialCode).toBe(TEMPLATE_LINES[i].materialCode);
      expect(restored.lines[i].description).toBe(TEMPLATE_LINES[i].description);
      expect(restored.lines[i].unit).toBe(TEMPLATE_LINES[i].unit);
    }
  });
});
