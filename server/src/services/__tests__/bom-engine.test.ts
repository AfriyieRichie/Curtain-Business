import Decimal from "decimal.js";
import { evaluateFormula, calculateBOM, serializeBOMSnapshot } from "../bom-engine";
import type { BOMInput, BOMTemplateLine } from "../bom-engine";

const baseInput: BOMInput = {
  widthCm: 200,
  dropCm: 250,
  fullnessRatio: 2.5,
  fabricWidthCm: 150,
};

describe("evaluateFormula", () => {
  it("calculates fabric quantity correctly", () => {
    const { quantity, error } = evaluateFormula(
      "(width_m * fullness_ratio) / fabric_width_m",
      baseInput
    );
    expect(error).toBeUndefined();
    // (2.0 * 2.5) / 1.5 = 3.3333
    expect(quantity.toNumber()).toBeCloseTo(3.3333, 3);
  });

  it("calculates heading tape quantity", () => {
    const { quantity } = evaluateFormula("width_m * fullness_ratio", baseInput);
    // 2.0 * 2.5 = 5.0
    expect(quantity.toNumber()).toBe(5);
  });

  it("rounds up eyelet rings with Math.ceil", () => {
    const { quantity } = evaluateFormula("Math.ceil(width_m * 4)", baseInput);
    // ceil(2.0 * 4) = ceil(8) = 8
    expect(quantity.toNumber()).toBe(8);
  });

  it("calculates curtain weights with Math.ceil and division", () => {
    const { quantity } = evaluateFormula("Math.ceil(width_m / 0.5)", baseInput);
    // ceil(2.0 / 0.5) = ceil(4) = 4
    expect(quantity.toNumber()).toBe(4);
  });

  it("calculates track with 5% overlap", () => {
    const { quantity } = evaluateFormula("width_m * 1.05", baseInput);
    expect(quantity.toNumber()).toBeCloseTo(2.1, 4);
  });

  it("handles drop_m in lining formula", () => {
    const { quantity } = evaluateFormula("drop_m + 0.3", baseInput);
    // 2.5 + 0.3 = 2.8
    expect(quantity.toNumber()).toBeCloseTo(2.8, 4);
  });

  it("returns error for injection attempt", () => {
    const { error } = evaluateFormula("require('fs')", baseInput);
    expect(error).toBeDefined();
    expect(error).toContain("Invalid formula");
  });

  it("returns error for negative result", () => {
    const { quantity, error } = evaluateFormula("width_m - 100", baseInput);
    expect(quantity.toNumber()).toBe(0);
    expect(error).toBeDefined();
  });

  it("returns zero for empty formula gracefully", () => {
    const { quantity } = evaluateFormula("0", baseInput);
    expect(quantity.toNumber()).toBe(0);
  });
});

describe("calculateBOM", () => {
  const templateLines: BOMTemplateLine[] = [
    {
      materialId: "mat-1",
      materialCode: "FAB-001",
      description: "Main Fabric",
      quantityFormula: "(width_m * fullness_ratio) / fabric_width_m",
      unit: "METER",
      unitCostUsd: "12.50",
      unitCostGhs: "193.75",
    },
    {
      materialId: "mat-2",
      materialCode: "HT-001",
      description: "Heading Tape",
      quantityFormula: "width_m * fullness_ratio",
      unit: "METER",
      unitCostUsd: "0.80",
      unitCostGhs: "12.40",
    },
    {
      materialId: "mat-3",
      materialCode: "EYE-001",
      description: "Eyelet Rings",
      quantityFormula: "Math.ceil(width_m * 4)",
      unit: "PIECE",
      unitCostUsd: "0.25",
      unitCostGhs: "3.875",
    },
  ];

  const rate = new Decimal("15.50");

  it("calculates all line totals correctly", () => {
    const result = calculateBOM(templateLines, baseInput, rate);
    expect(result.errors).toHaveLength(0);
    expect(result.lines).toHaveLength(3);

    const fabricLine = result.lines[0];
    expect(fabricLine.quantity.toNumber()).toBeCloseTo(3.3333, 3);
    expect(fabricLine.lineTotalUsd.toNumber()).toBeCloseTo(3.3333 * 12.5, 2);

    const tapeLine = result.lines[1];
    expect(tapeLine.quantity.toNumber()).toBe(5);
    expect(tapeLine.lineTotalGhs.toNumber()).toBeCloseTo(5 * 12.4, 4);
  });

  it("sums total material cost in USD and GHS", () => {
    const result = calculateBOM(templateLines, baseInput, rate);
    const expectedUsd = result.lines.reduce((s, l) => s.plus(l.lineTotalUsd), new Decimal(0));
    expect(result.totalMaterialCostUsd.toString()).toBe(expectedUsd.toString());
  });

  it("calculates suggested selling price with 35% markup", () => {
    const result = calculateBOM(templateLines, baseInput, rate, "0.35");
    const expected = result.totalMaterialCostGhs.mul("1.35").toDecimalPlaces(4);
    expect(result.suggestedSellingPriceGhs.toString()).toBe(expected.toString());
  });

  it("snapshots exchange rate used", () => {
    const result = calculateBOM(templateLines, baseInput, rate);
    expect(result.exchangeRateUsed.toString()).toBe("15.5");
  });

  it("collects errors from bad formulas without throwing", () => {
    const badLines: BOMTemplateLine[] = [
      { ...templateLines[0], quantityFormula: "eval('bad')" },
    ];
    const result = calculateBOM(badLines, baseInput, rate);
    expect(result.errors).toHaveLength(1);
  });

  it("returns zero totals for empty template", () => {
    const result = calculateBOM([], baseInput, rate);
    expect(result.totalMaterialCostUsd.toNumber()).toBe(0);
    expect(result.totalMaterialCostGhs.toNumber()).toBe(0);
  });
});

describe("serializeBOMSnapshot", () => {
  it("serialises all Decimal fields to strings", () => {
    const result = calculateBOM(
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
      baseInput,
      "15.5"
    );
    const snapshot = serializeBOMSnapshot(result);
    expect(typeof snapshot.totalMaterialCostUsd).toBe("string");
    expect(typeof snapshot.totalMaterialCostGhs).toBe("string");
    expect(typeof snapshot.exchangeRateUsed).toBe("string");
    const line = (snapshot.lines as Record<string, unknown>[])[0];
    expect(typeof line.quantity).toBe("string");
    expect(typeof line.lineTotalGhs).toBe("string");
  });
});
