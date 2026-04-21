import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { issueJobCardMaterial } from "../services/stock.service";
import { deserializeBOMSnapshot } from "../services/bom-engine";

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
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
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

  const order = await prisma.order.update({
    where: { id: req.params.id },
    data: {
      ...(status && { status: status as never }),
      ...(depositAmount && { depositAmount: new Decimal(depositAmount) }),
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
    include: { items: { include: { curtainType: true, bomTemplate: true } }, jobCards: true },
  });

  if (order.jobCards.length > 0) {
    throw new AppError(400, "Job cards already exist for this order.");
  }

  if (order.status === "CANCELLED") {
    throw new AppError(400, "Cannot generate job cards for a cancelled order.");
  }

  const jobCards = await prisma.$transaction(async (tx) => {
    const created = [];

    for (const item of order.items) {
      const bom = item.bomSnapshot ? deserializeBOMSnapshot(item.bomSnapshot as string) : null;

      const jc = await tx.jobCard.create({
        data: {
          orderId: order.id,
          orderItemId: item.id,
          curtainTypeId: item.curtainTypeId,
          status: "PENDING",
          assignedToId: assignedToId ?? null,
          ...(bom && {
            materials: {
              create: bom.lines.map((line) => ({
                materialId: line.materialId,
                requiredQty: new Decimal(line.quantity.toString()),
                notes: line.notes ?? null,
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
  const { status, assignedToId, completedAt } = req.body as {
    status?: string; assignedToId?: string; completedAt?: string;
  };

  const jc = await prisma.jobCard.update({
    where: { id: req.params.jobCardId },
    data: {
      ...(status && { status: status as never }),
      ...(assignedToId !== undefined && { assignedToId: assignedToId || null }),
      ...(completedAt && { completedAt: new Date(completedAt) }),
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
  const movement = await issueJobCardMaterial(req.params.materialId, req.auth!.userId);
  sendSuccess(res, movement, "Material issued.", 201);
}
