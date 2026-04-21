import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { getCurrentRate } from "../services/exchange-rate.service";
import { nextDocNumber } from "../services/doc-number.service";
import { calculateBOM, serializeBOMSnapshot } from "../services/bom-engine";

// ── List / Get ────────────────────────────────────────────────────────────────

export async function listQuotes(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { customerId, status, search } = req.query as Record<string, string>;

  const where: object = {
    ...(customerId && { customerId }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { quoteNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const [quotes, total] = await Promise.all([
    prisma.quote.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.quote.count({ where }),
  ]);

  sendPaginated(res, quotes, { page, limit, total });
}

export async function getQuote(req: Request, res: Response) {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      customer: true,
      items: {
        include: {
          curtainType: true,
          bomTemplate: true,
        },
      },
      createdBy: { select: { id: true, name: true } },
    },
  });
  sendSuccess(res, quote);
}

// ── Create ────────────────────────────────────────────────────────────────────

export async function createQuote(req: Request, res: Response) {
  const body = req.body as {
    customerId: string;
    validUntil?: string;
    notes?: string;
    items: Array<{
      curtainTypeId: string;
      bomTemplateId: string;
      description?: string;
      widthCm: number;
      dropCm: number;
      quantity: number;
      fullnessRatio?: number;
      fabricWidthCm?: number;
      unitPriceGhs?: string;
    }>;
  };

  const rateRecord = await getCurrentRate();
  if (!rateRecord) throw new AppError(400, "No exchange rate configured.");
  const rate = new Decimal(rateRecord.rate.toString());

  const quoteNumber = await nextDocNumber("QT");

  let totalGhs = new Decimal(0);

  const quote = await prisma.$transaction(async (tx) => {
    const itemsData = await Promise.all(
      body.items.map(async (item) => {
        const template = await tx.bOMTemplate.findUniqueOrThrow({
          where: { id: item.bomTemplateId },
          include: {
            curtainType: true,
            items: { include: { material: true } },
          },
        });

        const bomItems = template.items.map((ti) => ({
          materialId: ti.materialId,
          formula: ti.formula,
          notes: ti.notes ?? undefined,
        }));

        const input = {
          widthCm: item.widthCm,
          dropCm: item.dropCm,
          fullnessRatio: item.fullnessRatio ?? Number(template.curtainType.defaultFullnessRatio),
          fabricWidthCm: item.fabricWidthCm ?? 280,
        };

        const bomResult = calculateBOM(bomItems, input);
        const bomSnapshot = serializeBOMSnapshot(bomResult);

        // Compute material cost from BOM
        let matCostGhs = new Decimal(0);
        for (const line of bomResult.lines) {
          const mat = template.items.find((ti) => ti.materialId === line.materialId)!.material;
          matCostGhs = matCostGhs.plus(
            new Decimal(line.quantity.toString()).mul(new Decimal(mat.unitCostGhs.toString()))
          );
        }

        // Selling price: caller-supplied or auto-compute with 40% mark-up on material cost
        const [markupSetting] = await Promise.all([
          tx.businessSetting.findUnique({ where: { key: "currency.markupRatio" } }),
        ]);
        const markup = new Decimal(markupSetting?.value ?? "0.35");
        const unitPriceGhs = item.unitPriceGhs
          ? new Decimal(item.unitPriceGhs)
          : matCostGhs.mul(new Decimal(1).plus(markup)).toDecimalPlaces(2);

        const lineTotal = unitPriceGhs.mul(item.quantity).toDecimalPlaces(2);
        totalGhs = totalGhs.plus(lineTotal);

        return {
          curtainTypeId: item.curtainTypeId,
          bomTemplateId: item.bomTemplateId,
          description: item.description,
          widthCm: item.widthCm,
          dropCm: item.dropCm,
          quantity: item.quantity,
          fullnessRatio: input.fullnessRatio,
          fabricWidthCm: input.fabricWidthCm,
          bomSnapshot,
          unitPriceGhs,
          lineTotalGhs: lineTotal,
        };
      })
    );

    return tx.quote.create({
      data: {
        quoteNumber,
        customerId: body.customerId,
        exchangeRateAtCreation: rate,
        totalGhs,
        validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
        notes: body.notes,
        createdById: req.auth!.userId,
        items: { create: itemsData },
      },
      include: {
        customer: { select: { id: true, name: true } },
        items: true,
      },
    });
  });

  sendSuccess(res, quote, "Quote created.", 201);
}

// ── Update ────────────────────────────────────────────────────────────────────

export async function updateQuote(req: Request, res: Response) {
  const { validUntil, notes, status } = req.body as {
    validUntil?: string; notes?: string; status?: string;
  };

  const existing = await prisma.quote.findUniqueOrThrow({ where: { id: req.params.id } });
  if (existing.status === "ACCEPTED" || existing.status === "REJECTED") {
    throw new AppError(400, `Cannot modify a quote with status ${existing.status}.`);
  }

  const quote = await prisma.quote.update({
    where: { id: req.params.id },
    data: {
      ...(validUntil !== undefined && { validUntil: validUntil ? new Date(validUntil) : null }),
      ...(notes !== undefined && { notes }),
      ...(status && { status: status as never }),
    },
  });
  sendSuccess(res, quote, "Quote updated.");
}

// ── Convert to Order ──────────────────────────────────────────────────────────

export async function convertToOrder(req: Request, res: Response) {
  const { depositAmount } = req.body as { depositAmount?: string };

  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: req.params.id },
    include: { items: true },
  });

  if (quote.status !== "DRAFT" && quote.status !== "SENT") {
    throw new AppError(400, `Quote ${quote.quoteNumber} cannot be converted (status: ${quote.status}).`);
  }

  const orderNumber = await nextDocNumber("ORD");
  const rate = new Decimal(quote.exchangeRateAtCreation.toString());

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        customerId: quote.customerId,
        quoteId: quote.id,
        exchangeRateAtCreation: rate,
        totalGhs: quote.totalGhs,
        depositAmount: depositAmount ? new Decimal(depositAmount) : new Decimal(0),
        notes: quote.notes,
        createdById: req.auth!.userId,
        items: {
          create: quote.items.map((qi) => ({
            curtainTypeId: qi.curtainTypeId,
            bomTemplateId: qi.bomTemplateId,
            description: qi.description,
            widthCm: qi.widthCm,
            dropCm: qi.dropCm,
            quantity: qi.quantity,
            fullnessRatio: qi.fullnessRatio,
            fabricWidthCm: qi.fabricWidthCm,
            bomSnapshot: qi.bomSnapshot,
            unitPriceGhs: qi.unitPriceGhs,
            lineTotalGhs: qi.lineTotalGhs,
          })),
        },
      },
      include: { customer: { select: { id: true, name: true } }, items: true },
    });

    await tx.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });

    return newOrder;
  });

  sendSuccess(res, order, "Quote converted to order.", 201);
}
