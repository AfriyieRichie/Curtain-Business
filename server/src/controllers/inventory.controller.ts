import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { adjustStock } from "../services/stock.service";
import { getCurrentRate } from "../services/exchange-rate.service";
import { recalcGHSCost, applyMarkup } from "../utils/currency";

// ── Categories ────────────────────────────────────────────────────────────────

export async function listCategories(_req: Request, res: Response) {
  const cats = await prisma.materialCategory.findMany({ orderBy: { name: "asc" } });
  sendSuccess(res, cats);
}

export async function createCategory(req: Request, res: Response) {
  const { name, description } = req.body as { name: string; description?: string };
  const cat = await prisma.materialCategory.create({ data: { name, description } });
  sendSuccess(res, cat, "Category created.", 201);
}

// ── Materials ─────────────────────────────────────────────────────────────────

export async function listMaterials(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { categoryId, search, lowStock } = req.query as Record<string, string>;

  const where: object = {
    isActive: true,
    ...(categoryId && { categoryId }),
    ...(search && {
      OR: [
        { code: { contains: search, mode: "insensitive" } },
        { name: { contains: search, mode: "insensitive" } },
      ],
    }),
    ...(lowStock === "true" && {
      currentStock: { lte: prisma.material.fields.minimumStock },
    }),
  };

  const [materials, total] = await Promise.all([
    prisma.material.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        category: true,
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { code: "asc" },
    }),
    prisma.material.count({ where }),
  ]);

  sendPaginated(res, materials, { page, limit, total });
}

export async function getMaterial(req: Request, res: Response) {
  const material = await prisma.material.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { category: true, supplier: { select: { id: true, name: true } } },
  });
  sendSuccess(res, material);
}

export async function createMaterial(req: Request, res: Response) {
  const body = req.body as {
    code: string; name: string; description?: string; categoryId: string;
    unit: string; unitCostUsd: string; purchaseCurrency?: string;
    currentStock?: string; minimumStock?: string; reorderQuantity?: string;
    supplierId?: string; sellingPriceGhs?: string;
  };

  const rateRecord = await getCurrentRate();
  if (!rateRecord) throw new AppError(400, "No exchange rate configured. Please set a rate first.");
  const rate = new Decimal(rateRecord.rate.toString());

  const unitCostUsd = new Decimal(body.unitCostUsd);
  const unitCostGhs = recalcGHSCost(unitCostUsd, rate);
  const [markupSetting] = await Promise.all([
    prisma.businessSetting.findUnique({ where: { key: "currency.markupRatio" } }),
  ]);
  const markup = new Decimal(markupSetting?.value ?? "0.35");
  const sellingPriceGhs = body.sellingPriceGhs
    ? new Decimal(body.sellingPriceGhs)
    : applyMarkup(unitCostGhs, markup);

  const imageUrl = req.file
    ? `/uploads/images/${path.basename(req.file.path)}`
    : undefined;

  const material = await prisma.material.create({
    data: {
      code: body.code.toUpperCase(),
      name: body.name,
      description: body.description,
      categoryId: body.categoryId,
      unit: body.unit as never,
      unitCostUsd,
      unitCostGhs,
      exchangeRateUsed: rate,
      sellingPriceGhs,
      purchaseCurrency: (body.purchaseCurrency ?? "USD") as never,
      currentStock: body.currentStock ? new Decimal(body.currentStock) : new Decimal(0),
      minimumStock: body.minimumStock ? new Decimal(body.minimumStock) : new Decimal(0),
      reorderQuantity: body.reorderQuantity ? new Decimal(body.reorderQuantity) : new Decimal(0),
      supplierId: body.supplierId || null,
      imageUrl,
    },
    include: { category: true, supplier: { select: { id: true, name: true } } },
  });

  sendSuccess(res, material, "Material created.", 201);
}

export async function updateMaterial(req: Request, res: Response) {
  const body = req.body as {
    name?: string; description?: string; categoryId?: string; unit?: string;
    unitCostUsd?: string; minimumStock?: string; reorderQuantity?: string;
    supplierId?: string; sellingPriceGhs?: string; isActive?: boolean;
  };

  const existing = await prisma.material.findUniqueOrThrow({ where: { id: req.params.id } });

  let unitCostGhs = existing.unitCostGhs;
  let exchangeRateUsed = existing.exchangeRateUsed;

  if (body.unitCostUsd) {
    const rateRecord = await getCurrentRate();
    if (!rateRecord) throw new AppError(400, "No exchange rate configured.");
    const rate = new Decimal(rateRecord.rate.toString());
    unitCostGhs = recalcGHSCost(new Decimal(body.unitCostUsd), rate);
    exchangeRateUsed = rate;
  }

  const imageUrl = req.file
    ? `/uploads/images/${path.basename(req.file.path)}`
    : existing.imageUrl;

  const material = await prisma.material.update({
    where: { id: req.params.id },
    data: {
      ...(body.name && { name: body.name }),
      ...(body.description !== undefined && { description: body.description }),
      ...(body.categoryId && { categoryId: body.categoryId }),
      ...(body.unit && { unit: body.unit as never }),
      ...(body.unitCostUsd && { unitCostUsd: new Decimal(body.unitCostUsd), unitCostGhs, exchangeRateUsed }),
      ...(body.minimumStock && { minimumStock: new Decimal(body.minimumStock) }),
      ...(body.reorderQuantity && { reorderQuantity: new Decimal(body.reorderQuantity) }),
      ...(body.supplierId !== undefined && { supplierId: body.supplierId || null }),
      ...(body.sellingPriceGhs && { sellingPriceGhs: new Decimal(body.sellingPriceGhs) }),
      ...(body.isActive !== undefined && { isActive: body.isActive }),
      imageUrl,
    },
    include: { category: true, supplier: { select: { id: true, name: true } } },
  });

  sendSuccess(res, material, "Material updated.");
}

export async function deleteMaterial(req: Request, res: Response) {
  await prisma.material.update({ where: { id: req.params.id }, data: { isActive: false } });
  sendSuccess(res, null, "Material deactivated.");
}

// ── Bulk CSV Import ────────────────────────────────────────────────────────────

export async function bulkImport(req: Request, res: Response) {
  if (!req.file) throw new AppError(400, "No CSV file uploaded.");

  const rateRecord = await getCurrentRate();
  if (!rateRecord) throw new AppError(400, "No exchange rate configured.");
  const rate = new Decimal(rateRecord.rate.toString());
  const [markupSetting] = await Promise.all([
    prisma.businessSetting.findUnique({ where: { key: "currency.markupRatio" } }),
  ]);
  const markup = new Decimal(markupSetting?.value ?? "0.35");

  const content = fs.readFileSync(req.file.path, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());
  const headers = lines[0].toLowerCase().split(",").map((h) => h.trim());

  const idx = (name: string) => headers.indexOf(name);
  const col = (row: string[], name: string) => row[idx(name)]?.trim() ?? "";

  let imported = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const code = col(row, "code").toUpperCase();
    if (!code) { skipped++; continue; }

    try {
      const costUsd = new Decimal(col(row, "cost_usd") || "0");
      const costGhs = recalcGHSCost(costUsd, rate);

      const catName = col(row, "category");
      let category = catName
        ? await prisma.materialCategory.findFirst({ where: { name: { equals: catName, mode: "insensitive" } } })
        : null;
      if (!category && catName) {
        category = await prisma.materialCategory.create({ data: { name: catName } });
      }

      await prisma.material.upsert({
        where: { code },
        update: { unitCostUsd: costUsd, unitCostGhs: costGhs, exchangeRateUsed: rate },
        create: {
          code,
          name: col(row, "name") || code,
          categoryId: category?.id ?? (await prisma.materialCategory.findFirst())!.id,
          unit: (col(row, "unit").toUpperCase() || "PIECE") as never,
          unitCostUsd: costUsd,
          unitCostGhs: costGhs,
          exchangeRateUsed: rate,
          sellingPriceGhs: applyMarkup(costGhs, markup),
          currentStock: new Decimal(col(row, "stock") || "0"),
          minimumStock: new Decimal(col(row, "min_stock") || "0"),
        },
      });
      imported++;
    } catch (err) {
      errors.push(`Row ${i + 1} (${code}): ${(err as Error).message}`);
      skipped++;
    }
  }

  fs.unlinkSync(req.file.path);
  sendSuccess(res, { imported, skipped, errors });
}

// ── Stock Movements ────────────────────────────────────────────────────────────

export async function listMovements(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 30);

  const [movements, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where: { materialId: req.params.id },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.stockMovement.count({ where: { materialId: req.params.id } }),
  ]);

  sendPaginated(res, movements, { page, limit, total });
}

export async function adjustStockHandler(req: Request, res: Response) {
  const { quantity, movementType, notes } = req.body as {
    quantity: number; movementType: "MANUAL_ADJUSTMENT" | "DAMAGE" | "RETURN"; notes?: string;
  };

  const movement = await adjustStock(req.params.id, quantity, movementType, req.auth!.userId, notes);
  sendSuccess(res, movement, "Stock adjusted.", 201);
}

// ── Inventory Valuation ───────────────────────────────────────────────────────

export async function getValuation(_req: Request, res: Response) {
  const materials = await prisma.material.findMany({
    where: { isActive: true },
    include: { category: true },
  });

  let totalGhs = new Decimal(0);
  let totalUsd = new Decimal(0);

  const items = materials.map((m) => {
    const stock = new Decimal(m.currentStock.toString());
    const lineGhs = stock.mul(new Decimal(m.unitCostGhs.toString())).toDecimalPlaces(4);
    const lineUsd = stock.mul(new Decimal(m.unitCostUsd.toString())).toDecimalPlaces(4);
    totalGhs = totalGhs.plus(lineGhs);
    totalUsd = totalUsd.plus(lineUsd);
    return { ...m, lineValueGhs: lineGhs.toString(), lineValueUsd: lineUsd.toString() };
  });

  sendSuccess(res, { totalGhs: totalGhs.toDecimalPlaces(4).toString(), totalUsd: totalUsd.toDecimalPlaces(4).toString(), items });
}

// ── Low Stock Count (for sidebar badge) ───────────────────────────────────────

export async function getLowStockCount(_req: Request, res: Response) {
  const count = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM materials
    WHERE is_active = true AND current_stock <= minimum_stock
  `;
  sendSuccess(res, { count: Number(count[0].count) });
}
