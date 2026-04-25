import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";
import type { ApprovalEntityType } from "@prisma/client";

export async function createApprovalRequest(
  entityType: ApprovalEntityType,
  entityId: string,
  requestedById: string,
  context?: Record<string, unknown>
) {
  const existing = await prisma.approvalRequest.findFirst({
    where: { entityType, entityId, status: "PENDING" },
  });
  if (existing) return existing;

  return prisma.approvalRequest.create({
    data: { entityType, entityId, requestedById, context: context as Prisma.InputJsonValue ?? Prisma.JsonNull },
  });
}

export async function processApproval(
  approvalId: string,
  reviewerId: string,
  decision: "APPROVED" | "REJECTED",
  note?: string
) {
  const approval = await prisma.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
  });
  if (approval.status !== "PENDING") {
    throw new AppError(400, `Approval is already ${approval.status.toLowerCase()}.`);
  }

  await prisma.approvalRequest.update({
    where: { id: approvalId },
    data: { status: decision, reviewedById: reviewerId, reviewedAt: new Date(), note },
  });

  // Update approvalStatus on the entity
  const statusUpdate = { approvalStatus: decision };

  if (approval.entityType === "PURCHASE_ORDER") {
    await prisma.purchaseOrder.update({ where: { id: approval.entityId }, data: statusUpdate });
  } else if (approval.entityType === "EXPENSE") {
    await prisma.expense.update({ where: { id: approval.entityId }, data: statusUpdate });
  } else if (approval.entityType === "QUOTE_DISCOUNT") {
    await prisma.quote.update({ where: { id: approval.entityId }, data: statusUpdate });
  } else if (approval.entityType === "INVOICE_CANCELLATION") {
    await prisma.invoice.update({
      where: { id: approval.entityId },
      data: {
        approvalStatus: decision,
        ...(decision === "APPROVED" && { status: "CANCELLED" }),
      },
    });
  } else if (approval.entityType === "STOCK_ADJUSTMENT") {
    if (decision === "APPROVED") {
      await prisma.$transaction(async (tx) => {
        const movement = await tx.stockMovement.findUniqueOrThrow({
          where: { id: approval.entityId },
        });
        await tx.material.update({
          where: { id: movement.materialId },
          data: { currentStock: { increment: Number(movement.quantity) } },
        });
        await tx.stockMovement.update({
          where: { id: approval.entityId },
          data: { approvalStatus: "APPROVED" },
        });
      });
    } else {
      await prisma.stockMovement.update({
        where: { id: approval.entityId },
        data: { approvalStatus: "REJECTED" },
      });
    }
  } else if (approval.entityType === "ORDER_CONVERSION") {
    await prisma.order.update({
      where: { id: approval.entityId },
      data: {
        approvalStatus: decision,
        ...(decision === "APPROVED" && { status: "CONFIRMED" }),
      },
    });
  }

  return prisma.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
    include: {
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });
}
