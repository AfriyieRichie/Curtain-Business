import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { nextDocNumber } from "../services/doc-number.service";
import { receiveGRN } from "../services/stock.service";
import { getCurrentRate } from "../services/exchange-rate.service";

// ── Suppliers ─────────────────────────────────────────────────────────────────

export async function listSuppliers(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { search } = req.query as Record<string, string>;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { contactName: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [suppliers, total] = await Promise.all([
    prisma.supplier.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: { name: "asc" } }),
    prisma.supplier.count({ where }),
  ]);

  sendPaginated(res, suppliers, { page, limit, total });
}

export async function getSupplier(req: Request, res: Response) {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { _count: { select: { purchaseOrders: true, materials: true } } },
  });
  sendSuccess(res, supplier);
}

export async function createSupplier(req: Request, res: Response) {
  const { name, contactName, email, phone, address, currency, notes } = req.body as {
    name: string; contactName?: string; email?: string; phone?: string;
    address?: string; currency?: string; notes?: string;
  };
  const supplier = await prisma.supplier.create({
    data: { name, contactName, email, phone, address, currency: currency ?? "USD", notes },
  });
  sendSuccess(res, supplier, "Supplier created.", 201);
}

export async function updateSupplier(req: Request, res: Response) {
  const { name, contactName, email, phone, address, currency, notes } = req.body as {
    name?: string; contactName?: string; email?: string; phone?: string;
    address?: string; currency?: string; notes?: string;
  };
  const supplier = await prisma.supplier.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(contactName !== undefined && { contactName }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(currency && { currency }),
      ...(notes !== undefined && { notes }),
    },
  });
  sendSuccess(res, supplier, "Supplier updated.");
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export async function listPOs(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { supplierId, status } = req.query as Record<string, string>;

  const where: object = {
    ...(supplierId && { supplierId }),
    ...(status && { status }),
  };

  const [pos, total] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        supplier: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.purchaseOrder.count({ where }),
  ]);

  sendPaginated(res, pos, { page, limit, total });
}

export async function getPO(req: Request, res: Response) {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      supplier: true,
      items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
      grns: {
        include: { items: { include: { material: { select: { id: true, code: true, name: true } } } } },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
  sendSuccess(res, po);
}

export async function createPO(req: Request, res: Response) {
  const { supplierId, expectedDate, notes, items } = req.body as {
    supplierId: string;
    expectedDate?: string;
    notes?: string;
    items: Array<{ materialId: string; orderedQty: number; unitCostUsd: number }>;
  };

  const rateRecord = await getCurrentRate();
  if (!rateRecord) throw new AppError(400, "No exchange rate configured.");
  const rate = new Decimal(rateRecord.rate.toString());

  const poNumber = await nextDocNumber("PO");
  const totalUsd = items.reduce(
    (sum, item) => sum.plus(new Decimal(item.unitCostUsd).mul(item.orderedQty)),
    new Decimal(0)
  );
  const totalGhs = totalUsd.mul(rate).toDecimalPlaces(2);

  const po = await prisma.purchaseOrder.create({
    data: {
      poNumber,
      supplierId,
      exchangeRateAtCreation: rate,
      totalUsd,
      totalGhs,
      expectedDate: expectedDate ? new Date(expectedDate) : undefined,
      notes,
      createdById: req.auth!.userId,
      items: {
        create: items.map((item) => ({
          materialId: item.materialId,
          orderedQty: new Decimal(item.orderedQty),
          unitCostUsd: new Decimal(item.unitCostUsd),
        })),
      },
    },
    include: {
      supplier: { select: { id: true, name: true } },
      items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
    },
  });

  sendSuccess(res, po, "Purchase order created.", 201);
}

export async function updatePO(req: Request, res: Response) {
  const { status, expectedDate, notes } = req.body as {
    status?: string; expectedDate?: string; notes?: string;
  };

  const po = await prisma.purchaseOrder.findUniqueOrThrow({ where: { id: req.params.id } });
  if (po.status === "RECEIVED") {
    throw new AppError(400, "Cannot modify a fully received purchase order.");
  }

  const updated = await prisma.purchaseOrder.update({
    where: { id: req.params.id },
    data: {
      ...(status && { status: status as never }),
      ...(expectedDate !== undefined && { expectedDate: expectedDate ? new Date(expectedDate) : null }),
      ...(notes !== undefined && { notes }),
    },
  });
  sendSuccess(res, updated, "Purchase order updated.");
}

// ── GRN (Goods Received Note) ─────────────────────────────────────────────────

export async function listGRNs(req: Request, res: Response) {
  const grns = await prisma.goodsReceivedNote.findMany({
    where: { poId: req.params.id },
    include: {
      items: { include: { material: { select: { id: true, code: true, name: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { receivedDate: "desc" },
  });
  sendSuccess(res, grns);
}

export async function createGRN(req: Request, res: Response) {
  const { exchangeRateAtReceipt, items } = req.body as {
    exchangeRateAtReceipt?: string;
    items: Array<{ poItemId: string; receivedQty: number; unitCostUsd: number }>;
  };

  const rateRecord = await getCurrentRate();
  if (!rateRecord) throw new AppError(400, "No exchange rate configured.");
  const rate = exchangeRateAtReceipt ?? rateRecord.rate.toString();

  const grnNumber = await nextDocNumber("GRN");

  const result = await receiveGRN(req.params.id, grnNumber, rate, items, req.auth!.userId);
  sendSuccess(res, result, "GRN created. Stock updated.", 201);
}
