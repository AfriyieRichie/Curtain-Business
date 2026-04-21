import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { recalcGHSCost, applyMarkup } from "../utils/currency";

/** Returns the most recently created exchange rate record. */
export async function getCurrentRate() {
  return prisma.exchangeRate.findFirst({ orderBy: { createdAt: "desc" }, include: { createdBy: { select: { id: true, name: true } } } });
}

/** Creates a new rate record and queues a background material recalculation. */
export async function updateRate(rateValue: string, userId: string) {
  const rate = await prisma.exchangeRate.create({
    data: {
      rate: new Decimal(rateValue),
      effectiveDate: new Date(),
      source: "MANUAL",
      createdById: userId,
    },
    include: { createdBy: { select: { id: true, name: true } } },
  });

  // Fire-and-forget — recalculate GHS costs on all active USD materials
  recalculateMaterialCosts(new Decimal(rateValue)).catch((err) =>
    console.error("Material GHS recalculation failed:", err)
  );

  return rate;
}

/**
 * Recalculates unitCostGhs and sellingPriceGhs for every active USD-priced material.
 * Called after a rate update.  Runs in the background — never awaited by the request.
 */
export async function recalculateMaterialCosts(newRate: Decimal): Promise<void> {
  const [materials, markupSetting] = await Promise.all([
    prisma.material.findMany({ where: { isActive: true, purchaseCurrency: "USD" } }),
    prisma.businessSetting.findUnique({ where: { key: "currency.markupRatio" } }),
  ]);

  const markup = new Decimal(markupSetting?.value ?? "0.35");

  for (const m of materials) {
    const newGHS = recalcGHSCost(m.unitCostUsd, newRate);
    await prisma.material.update({
      where: { id: m.id },
      data: {
        unitCostGhs: newGHS,
        exchangeRateUsed: newRate,
        sellingPriceGhs: applyMarkup(newGHS, markup),
      },
    });
  }
}

/** Attempts to auto-fetch the USD→GHS rate from exchangerate-api.com */
export async function autoFetchRate(userId: string): Promise<{ rate: string } | null> {
  const apiKey = process.env.EXCHANGE_RATE_API_KEY;
  const baseUrl = process.env.EXCHANGE_RATE_API_URL;
  if (!apiKey || !baseUrl) return null;

  const res = await fetch(`${baseUrl}/${apiKey}/latest/USD`);
  if (!res.ok) return null;

  const data = (await res.json()) as { conversion_rates?: { GHS?: number } };
  const ghsRate = data?.conversion_rates?.GHS;
  if (!ghsRate) return null;

  await prisma.exchangeRate.create({
    data: {
      rate: new Decimal(ghsRate.toFixed(6)),
      effectiveDate: new Date(),
      source: "AUTO",
      createdById: userId,
    },
  });

  await recalculateMaterialCosts(new Decimal(ghsRate.toFixed(6)));
  return { rate: ghsRate.toFixed(6) };
}
