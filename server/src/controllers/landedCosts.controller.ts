import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { nextDocNumber } from "../services/doc-number.service";
import { postLandedCostEntry } from "../services/stock.service";
import { getCurrentRate } from "../services/exchange-rate.service";
import Decimal from "decimal.js";

// ── List all LCEs ─────────────────────────────────────────────────────────────

export async function listLCEs(req: Request, res: Response) {
  const page = parseInt(req.query.page as string) || 1;
  const limit = 20;

  const [total, items] = await Promise.all([
    prisma.landedCostEntry.count(),
    prisma.landedCostEntry.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: {
        grns: {
          include: {
            grn: {
              select: {
                grnNumber: true,
                receivedDate: true,
                po: { select: { poNumber: true, supplier: { select: { name: true } } } },
              },
            },
          },
        },
      },
    }),
  ]);

  sendPaginated(res, items, { page, limit, total });
}

// ── List GRNs available for linking to an LCE ────────────────────────────────
// Returns all GRNs with their USD value; includes info on any existing allocation

export async function listAvailableGRNs(_req: Request, res: Response) {
  const grns = await prisma.goodsReceivedNote.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      po: { select: { poNumber: true, supplier: { select: { name: true } } } },
      items: {
        select: { receivedQty: true, unitCostUsd: true, unitCostGhs: true },
      },
      lceAllocations: {
        include: { lce: { select: { lceNumber: true, status: true } } },
      },
    },
  });

  const result = grns.map((grn) => {
    const totalUsd = grn.items.reduce(
      (s, i) => s.plus(new Decimal(i.unitCostUsd.toString()).mul(new Decimal(i.receivedQty.toString()))),
      new Decimal(0)
    );
    const postedAllocation = grn.lceAllocations.find((a) => a.lce.status === "POSTED");
    return {
      id: grn.id,
      grnNumber: grn.grnNumber,
      receivedDate: grn.receivedDate,
      poNumber: grn.po.poNumber,
      supplierName: grn.po.supplier.name,
      totalUsd: totalUsd.toFixed(2),
      hasPostedLCE: !!postedAllocation,
      existingLCE: postedAllocation ? postedAllocation.lce.lceNumber : null,
    };
  });

  sendSuccess(res, result);
}

// ── Create LCE (as DRAFT) ────────────────────────────────────────────────────

export async function createLCE(req: Request, res: Response) {
  const { freightCostUsd, clearingCostGhs, otherLandedGhs, exchangeRate, notes, grnIds } = req.body as {
    freightCostUsd?: number;
    clearingCostGhs?: number;
    otherLandedGhs?: number;
    exchangeRate?: string;
    notes?: string;
    grnIds: string[];
  };

  if (!grnIds || grnIds.length === 0) throw new AppError(400, "At least one GRN must be selected.");

  // Verify all GRNs exist
  const grns = await prisma.goodsReceivedNote.findMany({
    where: { id: { in: grnIds } },
    select: { id: true },
  });
  if (grns.length !== grnIds.length) throw new AppError(400, "One or more GRN IDs are invalid.");

  // Resolve exchange rate
  let rate = exchangeRate;
  if (!rate) {
    const rateRecord = await getCurrentRate();
    if (!rateRecord) throw new AppError(400, "No exchange rate configured. Please set a rate first.");
    rate = rateRecord.rate.toString();
  }

  const lceNumber = await nextDocNumber("LCE");

  const lce = await prisma.landedCostEntry.create({
    data: {
      lceNumber,
      freightCostUsd: freightCostUsd ? new Decimal(freightCostUsd) : new Decimal(0),
      clearingCostGhs: clearingCostGhs ? new Decimal(clearingCostGhs) : new Decimal(0),
      otherLandedGhs: otherLandedGhs ? new Decimal(otherLandedGhs) : new Decimal(0),
      exchangeRate: new Decimal(rate),
      notes: notes || null,
      status: "DRAFT",
      createdById: req.auth!.userId,
      grns: {
        create: grnIds.map((grnId) => ({ grnId, allocatedGhs: new Decimal(0) })),
      },
    },
    include: {
      grns: {
        include: {
          grn: {
            select: {
              grnNumber: true,
              receivedDate: true,
              po: { select: { poNumber: true, supplier: { select: { name: true } } } },
              items: { select: { receivedQty: true, unitCostUsd: true } },
            },
          },
        },
      },
    },
  });

  sendSuccess(res, lce, "Landed cost entry created.", 201);
}

// ── Get single LCE ───────────────────────────────────────────────────────────

export async function getLCE(req: Request, res: Response) {
  const lce = await prisma.landedCostEntry.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      grns: {
        include: {
          grn: {
            select: {
              grnNumber: true,
              receivedDate: true,
              exchangeRateAtReceipt: true,
              po: { select: { poNumber: true, supplier: { select: { name: true } } } },
              items: { select: { receivedQty: true, unitCostUsd: true, material: { select: { code: true, name: true, unit: true } } } },
            },
          },
        },
      },
    },
  });
  sendSuccess(res, lce);
}

// ── Update DRAFT LCE ─────────────────────────────────────────────────────────

export async function updateLCE(req: Request, res: Response) {
  const lce = await prisma.landedCostEntry.findUniqueOrThrow({ where: { id: req.params.id } });
  if (lce.status === "POSTED") throw new AppError(400, "Cannot edit a posted landed cost entry.");

  const { freightCostUsd, clearingCostGhs, otherLandedGhs, exchangeRate, notes, grnIds } = req.body as {
    freightCostUsd?: number;
    clearingCostGhs?: number;
    otherLandedGhs?: number;
    exchangeRate?: string;
    notes?: string;
    grnIds?: string[];
  };

  const updated = await prisma.$transaction(async (tx) => {
    if (grnIds !== undefined) {
      // Replace the GRN set
      await tx.landedCostGRN.deleteMany({ where: { lceId: lce.id } });
      if (grnIds.length > 0) {
        await tx.landedCostGRN.createMany({
          data: grnIds.map((grnId) => ({ id: require("crypto").randomUUID(), lceId: lce.id, grnId, allocatedGhs: new Decimal(0) })),
        });
      }
    }
    return tx.landedCostEntry.update({
      where: { id: lce.id },
      data: {
        ...(freightCostUsd !== undefined && { freightCostUsd: new Decimal(freightCostUsd) }),
        ...(clearingCostGhs !== undefined && { clearingCostGhs: new Decimal(clearingCostGhs) }),
        ...(otherLandedGhs !== undefined && { otherLandedGhs: new Decimal(otherLandedGhs) }),
        ...(exchangeRate !== undefined && { exchangeRate: new Decimal(exchangeRate) }),
        ...(notes !== undefined && { notes }),
      },
      include: {
        grns: {
          include: {
            grn: {
              select: {
                grnNumber: true,
                receivedDate: true,
                po: { select: { poNumber: true, supplier: { select: { name: true } } } },
                items: { select: { receivedQty: true, unitCostUsd: true } },
              },
            },
          },
        },
      },
    });
  });

  sendSuccess(res, updated);
}

// ── Post LCE ─────────────────────────────────────────────────────────────────

export async function postLCE(req: Request, res: Response) {
  const result = await postLandedCostEntry(req.params.id, req.auth!.userId);
  sendSuccess(res, result, "Landed costs posted. Material costs updated.");
}
