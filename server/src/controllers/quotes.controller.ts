import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { getCurrentRate } from "../services/exchange-rate.service";
import { nextDocNumber } from "../services/doc-number.service";
import { calculateBOM, serializeBOMSnapshot, evaluateFormula } from "../services/bom-engine";
import { createApprovalRequest } from "../services/approval.service";

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
    discountRate?: number;
    validUntil?: string;
    notes?: string;
    items: Array<{
      curtainTypeId: string;
      bomTemplateId: string;
      windowLabel: string;
      fabricMaterialId: string;
      liningMaterialId?: string;
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

        // Fetch substitution materials for FABRIC / LINING roles
        const [fabricMat, liningMat] = await Promise.all([
          item.fabricMaterialId ? tx.material.findUnique({ where: { id: item.fabricMaterialId } }) : null,
          item.liningMaterialId ? tx.material.findUnique({ where: { id: item.liningMaterialId } }) : null,
        ]);

        const bomItems = template.items.map((ti) => {
          let mat: typeof ti.material = ti.material;
          if (ti.role === "FABRIC" && fabricMat) mat = fabricMat;
          if (ti.role === "LINING" && liningMat) mat = liningMat;
          return {
            materialId: mat.id,
            materialCode: mat.code,
            description: mat.name,
            quantityFormula: ti.quantityFormula,
            unit: mat.unit,
            unitCostUsd: mat.unitCostUsd,
            unitCostGhs: mat.unitCostGhs,
          };
        });

        const input = {
          widthCm: item.widthCm,
          dropCm: item.dropCm,
          fullnessRatio: item.fullnessRatio ?? Number(template.defaultFullnessRatio),
          fabricWidthCm: item.fabricWidthCm ?? 280,
        };

        const bomResult = calculateBOM(bomItems, input, rate);
        const bomSnapshot = serializeBOMSnapshot(bomResult);

        // Use the already-computed total which accounts for fabric/lining substitutions
        const matCostGhs = bomResult.totalMaterialCostGhs;

        // Labour + overhead from template and global settings
        const [markupSetting, labourRateSetting, overheadRateSetting] = await Promise.all([
          tx.businessSetting.findUnique({ where: { key: "currency.markupRatio" } }),
          tx.businessSetting.findUnique({ where: { key: "production.labourRateGhs" } }),
          tx.businessSetting.findUnique({ where: { key: "production.overheadRateGhs" } }),
        ]);
        const markup = new Decimal(markupSetting?.value ?? "0.35");
        const labourRate = new Decimal(labourRateSetting?.value ?? "0");
        const overheadRate = new Decimal(overheadRateSetting?.value ?? "0");
        // Evaluate labour hours formula with actual panel dimensions if set
        const labourHoursD = template.labourHoursFormula
          ? evaluateFormula(template.labourHoursFormula, input).quantity
          : new Decimal(template.labourHours.toString());
        const labourCostGhs = labourHoursD.mul(labourRate);
        const overheadCostGhs = labourHoursD.mul(overheadRate).plus(new Decimal(template.overheadGhs.toString()));
        const totalCostGhs = matCostGhs.plus(labourCostGhs).plus(overheadCostGhs);

        const unitPriceGhs = item.unitPriceGhs
          ? new Decimal(item.unitPriceGhs)
          : totalCostGhs.mul(new Decimal(1).plus(markup)).toDecimalPlaces(2);

        const lineTotal = unitPriceGhs.mul(item.quantity).toDecimalPlaces(2);
        totalGhs = totalGhs.plus(lineTotal);

        return {
          curtainTypeId: item.curtainTypeId,
          bomTemplateId: item.bomTemplateId,
          windowLabel: item.windowLabel,
          fabricMaterialId: item.fabricMaterialId,
          liningMaterialId: item.liningMaterialId,
          description: item.description,
          widthCm: item.widthCm,
          dropCm: item.dropCm,
          quantity: item.quantity,
          fullnessRatio: input.fullnessRatio,
          bomSnapshot,
          unitPriceGhs,
          lineTotalGhs: lineTotal,
          lineCostUsd: bomResult.totalMaterialCostUsd,
          lineCostGhs: bomResult.totalMaterialCostGhs,
          exchangeRateAtQuote: rate,
        };
      })
    );

    const subtotalGhs = totalGhs;
    const discountRate = body.discountRate ?? 0;
    const discountAmountGhs = subtotalGhs.mul(discountRate).div(100).toDecimalPlaces(2);
    const finalTotalGhs = subtotalGhs.minus(discountAmountGhs);

    const [discountThresholdSetting, highValueThresholdSetting] = await Promise.all([
      tx.businessSetting.findUnique({ where: { key: "approval.quoteDiscountThresholdPct" } }),
      tx.businessSetting.findUnique({ where: { key: "approval.orderTotalThresholdGhs" } }),
    ]);
    const discountThreshold = Number(discountThresholdSetting?.value ?? "10");
    const highValueThreshold = new Decimal(highValueThresholdSetting?.value ?? "5000");
    const needsDiscountApproval = discountRate > discountThreshold;
    const needsHighValueApproval = finalTotalGhs.gt(highValueThreshold);
    const needsApproval = needsDiscountApproval || needsHighValueApproval;

    return tx.quote.create({
      data: {
        quoteNumber,
        customerId: body.customerId,
        exchangeRateSnapshot: rate,
        subtotalGhs,
        discountAmountGhs,
        discountRate: discountRate > 0 ? new Decimal(discountRate) : null,
        totalGhs: finalTotalGhs,
        approvalStatus: needsApproval ? "PENDING" : null,
        validUntil: body.validUntil ? new Date(body.validUntil) : undefined,
        notes: body.notes,
        createdById: req.auth!.userId,
        items: { create: itemsData as never },
      },
      include: {
        customer: { select: { id: true, name: true } },
        items: true,
      },
    });
  });

  const appliedDiscountRate = body.discountRate ?? 0;
  const quoteRecord = quote as typeof quote & { approvalStatus: string | null };

  // Create separate approval requests for each triggered condition
  if (quoteRecord.approvalStatus === "PENDING") {
    const [discountThresholdSetting2, highValueThresholdSetting2] = await Promise.all([
      prisma.businessSetting.findUnique({ where: { key: "approval.quoteDiscountThresholdPct" } }),
      prisma.businessSetting.findUnique({ where: { key: "approval.orderTotalThresholdGhs" } }),
    ]);
    const discountThresholdVal = Number(discountThresholdSetting2?.value ?? "10");
    const highValThreshold = new Decimal(highValueThresholdSetting2?.value ?? "5000");

    if (appliedDiscountRate > discountThresholdVal) {
      await createApprovalRequest("QUOTE_DISCOUNT", quote.id, req.auth!.userId, {
        quoteNumber: quote.quoteNumber,
        discountRate: appliedDiscountRate,
        discountAmountGhs: quote.discountAmountGhs.toString(),
        totalGhs: quote.totalGhs.toString(),
      });
    }
    if (new Decimal(quote.totalGhs.toString()).gt(highValThreshold)) {
      await createApprovalRequest("QUOTE_HIGH_VALUE", quote.id, req.auth!.userId, {
        quoteNumber: quote.quoteNumber,
        totalGhs: quote.totalGhs.toString(),
        thresholdGhs: highValThreshold.toString(),
      });
    }
  }

  sendSuccess(res, quote, quoteRecord.approvalStatus === "PENDING" ? "Quote created — pending management approval." : "Quote created.", 201);
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

  if (status === "SENT") {
    const existingWithApproval = existing as typeof existing & { approvalStatus: string | null };
    if (existingWithApproval.approvalStatus === "PENDING") {
      throw new AppError(403, "This quote is awaiting management approval and cannot be sent to the customer until it is approved.");
    }
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

  const quoteWithApproval = quote as typeof quote & { approvalStatus: string | null };
  if (quoteWithApproval.approvalStatus === "PENDING") {
    throw new AppError(403, "This quote has a discount pending approval. It cannot be converted until approved.");
  }

  const orderTotalThresholdSetting = await prisma.businessSetting.findUnique({
    where: { key: "approval.orderTotalThresholdGhs" },
  });
  const orderThreshold = new Decimal(orderTotalThresholdSetting?.value ?? "5000");
  const needsOrderApproval = new Decimal(quote.totalGhs.toString()).gt(orderThreshold);

  const orderNumber = await nextDocNumber("ORD");
  const rate = new Decimal(quote.exchangeRateSnapshot.toString());
  const deposit = depositAmount ? new Decimal(depositAmount) : new Decimal(0);
  const balance = new Decimal(quote.totalGhs.toString()).minus(deposit);

  const order = await prisma.$transaction(async (tx) => {
    const newOrder = await tx.order.create({
      data: {
        orderNumber,
        customerId: quote.customerId,
        quoteId: quote.id,
        exchangeRateSnapshot: rate,
        subtotalGhs: quote.subtotalGhs,
        discountAmountGhs: quote.discountAmountGhs,
        totalGhs: quote.totalGhs,
        depositAmountGhs: deposit,
        balanceDueGhs: balance.gt(0) ? balance : new Decimal(0),
        notes: quote.notes,
        status: needsOrderApproval ? "PENDING" : "CONFIRMED",
        approvalStatus: needsOrderApproval ? "PENDING" : null,
        createdById: req.auth!.userId,
        items: {
          create: quote.items.map((qi) => ({
            curtainTypeId: qi.curtainTypeId,
            bomTemplateId: qi.bomTemplateId,
            windowLabel: qi.windowLabel,
            fabricMaterialId: qi.fabricMaterialId,
            liningMaterialId: qi.liningMaterialId ?? undefined,
            description: qi.description ?? undefined,
            widthCm: qi.widthCm,
            dropCm: qi.dropCm,
            quantity: qi.quantity,
            fullnessRatio: qi.fullnessRatio,
            bomSnapshot: qi.bomSnapshot,
            unitPriceGhs: qi.unitPriceGhs,
            lineTotalGhs: qi.lineTotalGhs,
            lineCostUsd: qi.lineCostUsd,
            lineCostGhs: qi.lineCostGhs,
          })) as never,
        },
      },
      include: { customer: { select: { id: true, name: true } }, items: true },
    });

    await tx.quote.update({ where: { id: quote.id }, data: { status: "ACCEPTED" } });

    return newOrder;
  });

  if (needsOrderApproval) {
    await createApprovalRequest("ORDER_CONVERSION", order.id, req.auth!.userId, {
      orderNumber: order.orderNumber,
      totalGhs: quote.totalGhs.toString(),
      thresholdGhs: orderThreshold.toString(),
    });
  }

  sendSuccess(res, order, needsOrderApproval ? "Order created — pending approval due to high value." : "Quote converted to order.", 201);
}
