import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { issueJobCardMaterial } from "../services/stock.service";
import { deserializeBOMSnapshot, evaluateFormula } from "../services/bom-engine";
import { nextDocNumber } from "../services/doc-number.service";

// ── List / Get ────────────────────────────────────────────────────────────────

export async function listOrders(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { customerId, status, search } = req.query as Record<string, string>;

  const where: object = {
    ...(customerId && { customerId }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { orderNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        customer: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        _count: { select: { jobCards: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.count({ where }),
  ]);

  sendPaginated(res, orders, { page, limit, total });
}

export async function getOrder(req: Request, res: Response) {
  const order = await prisma.order.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      customer: true,
      quote: { select: { id: true, quoteNumber: true } },
      items: { include: { curtainType: true } },
      jobCards: {
        include: {
          materials: {
            include: { material: { select: { id: true, code: true, name: true, unit: true } } },
          },
          assignedTo: { select: { id: true, name: true } },
        },
      },
      invoices: { select: { id: true, invoiceNumber: true, status: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });
  sendSuccess(res, order);
}

// ── Update Status / Deposit ───────────────────────────────────────────────────

export async function updateOrder(req: Request, res: Response) {
  const { status, depositAmount, notes } = req.body as {
    status?: string; depositAmount?: string; notes?: string;
  };

  let depositData: object = {};
  if (depositAmount !== undefined) {
    const current = await prisma.order.findUniqueOrThrow({ where: { id: req.params.id }, select: { totalGhs: true } });
    const deposit = new Decimal(depositAmount);
    const balance = new Decimal(current.totalGhs.toString()).minus(deposit);
    depositData = {
      depositAmountGhs: deposit,
      balanceDueGhs: balance.gt(0) ? balance : new Decimal(0),
    };
  }

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: {
      ...(status && { status: status as never }),
      ...depositData,
      ...(notes !== undefined && { notes }),
    },
  });
  sendSuccess(res, order, "Order updated.");
}

// ── Job Card Generation ───────────────────────────────────────────────────────

export async function generateJobCards(req: Request, res: Response) {
  const { assignedToId } = req.body as { assignedToId?: string };

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      items: { include: { curtainType: true, bomTemplate: true } },
      jobCards: true,
    },
  });

  if (order.jobCards.length > 0) {
    throw new AppError(400, "Job cards already exist for this order.");
  }

  if (order.status === "CANCELLED") {
    throw new AppError(400, "Cannot generate job cards for a cancelled order.");
  }

  const jobNumbers = await Promise.all(order.items.map(() => nextDocNumber("JC")));

  const jobCards = await prisma.$transaction(async (tx) => {
    const created = [];

    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      const bom = item.bomSnapshot ? deserializeBOMSnapshot(item.bomSnapshot as Record<string, unknown>) : null;

      // Compute standard labour hours from formula or fixed value
      const bom_input = {
        widthCm: Number(item.widthCm),
        dropCm: Number(item.dropCm),
        fullnessRatio: Number(item.fullnessRatio),
        fabricWidthCm: 280,
      };
      const standardLabourHours = item.bomTemplate.labourHoursFormula
        ? evaluateFormula(item.bomTemplate.labourHoursFormula, bom_input).quantity
        : new Decimal(item.bomTemplate.labourHours.toString());

      const jc = await tx.jobCard.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          jobNumber: jobNumbers[i],
          status: "PENDING",
          assignedToId: assignedToId ?? null,
          standardLabourHours,
          notes: `Window: ${item.windowLabel}`,
          ...(bom && {
            materials: {
              create: bom.lines.map((line) => ({
                materialId: line.materialId,
                requiredQty: new Decimal(line.quantity.toString()),
              })),
            },
          }),
        },
        include: {
          materials: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
        },
      });

      created.push(jc);
    }

    await tx.order.update({ where: { id: order.id }, data: { status: "IN_PRODUCTION" } });

    return created;
  });

  sendSuccess(res, jobCards, "Job cards generated.", 201);
}

// ── Job Card: update status ───────────────────────────────────────────────────

export async function updateJobCard(req: Request, res: Response) {
  const { status, assignedToId, completedAt, labourCostGhs, machineCostGhs, overheadCostGhs } = req.body as {
    status?: string; assignedToId?: string; completedAt?: string;
    labourCostGhs?: string; machineCostGhs?: string; overheadCostGhs?: string;
  };

  const jc = await prisma.jobCard.update({
    where: { id: req.params.jobCardId },
    data: {
      ...(status && { status: status as never }),
      ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
      ...(completedAt && { completedAt: new Date(completedAt) }),
      ...(labourCostGhs !== undefined && { labourCostGhs: new Decimal(labourCostGhs) }),
      ...(machineCostGhs !== undefined && { machineCostGhs: new Decimal(machineCostGhs) }),
      ...(overheadCostGhs !== undefined && { overheadCostGhs: new Decimal(overheadCostGhs) }),
    },
  });

  // If all job cards for the order are complete, mark order COMPLETED
  const allCards = await prisma.jobCard.findMany({ where: { orderId: jc.orderId } });
  const allDone = allCards.every((c) => c.status === "COMPLETED");
  if (allDone) {
    await prisma.order.update({ where: { id: jc.orderId }, data: { status: "COMPLETED" } });
  }

  sendSuccess(res, jc, "Job card updated.");
}

// ── Issue material for a job card ─────────────────────────────────────────────

export async function issueMaterial(req: Request, res: Response) {
  // req.params.materialId is the JobCardMaterial record id (not Material.id)
  const jcm = await prisma.jobCardMaterial.findFirstOrThrow({
    where: { id: req.params.materialId, jobCardId: req.params.jobCardId },
  });
  const movement = await issueJobCardMaterial(jcm.id, req.auth!.userId);
  sendSuccess(res, movement, "Material issued.", 201);
}
