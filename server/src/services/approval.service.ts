import { Prisma } from "@prisma/client";
import { prisma } from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";
import type { ApprovalEntityType } from "@prisma/client";
import { nextDocNumber } from "./doc-number.service";
import { deserializeBOMSnapshot, evaluateFormula } from "./bom-engine";
import Decimal from "decimal.js";

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
  } else if (approval.entityType === "QUOTE_DISCOUNT" || approval.entityType === "QUOTE_HIGH_VALUE") {
    if (decision === "REJECTED") {
      // Reject immediately — no point waiting for the other
      await prisma.quote.update({ where: { id: approval.entityId }, data: { approvalStatus: "REJECTED" } });
    } else {
      // Only mark APPROVED when no other PENDING quote approval requests remain
      const otherPending = await prisma.approvalRequest.findFirst({
        where: {
          entityId: approval.entityId,
          entityType: { in: ["QUOTE_DISCOUNT", "QUOTE_HIGH_VALUE"] },
          id: { not: approvalId },
          status: "PENDING",
        },
      });
      if (!otherPending) {
        await prisma.quote.update({ where: { id: approval.entityId }, data: { approvalStatus: "APPROVED" } });
      }
      // else: other request still pending — leave approvalStatus as PENDING
    }
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
    if (decision === "APPROVED") {
      const order = await prisma.order.findUniqueOrThrow({
        where: { id: approval.entityId },
        include: {
          items: { include: { bomTemplate: true } },
          jobCards: true,
        },
      });

      await prisma.order.update({
        where: { id: approval.entityId },
        data: { approvalStatus: "APPROVED", status: "CONFIRMED" },
      });

      // Auto-create job cards if none exist yet
      if (order.jobCards.length === 0) {
        const jobNumbers = await Promise.all(order.items.map(() => nextDocNumber("JC")));

        await prisma.$transaction(async (tx) => {
          for (let i = 0; i < order.items.length; i++) {
            const item = order.items[i];
            const bom = item.bomSnapshot ? deserializeBOMSnapshot(item.bomSnapshot as Record<string, unknown>) : null;

            const bomInput = {
              widthCm: Number(item.widthCm),
              dropCm: Number(item.dropCm),
              fullnessRatio: Number(item.fullnessRatio),
              fabricWidthCm: 280,
            };
            const standardLabourHours = item.bomTemplate.labourHoursFormula
              ? evaluateFormula(item.bomTemplate.labourHoursFormula, bomInput).quantity
              : new Decimal(item.bomTemplate.labourHours.toString());

            await tx.jobCard.create({
              data: {
                orderId: order.id,
                orderItemId: item.id,
                jobNumber: jobNumbers[i],
                status: "PENDING",
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
            });
          }

          // Stay CONFIRMED — order moves to IN_PRODUCTION when workshop starts a job card
        });
      }
    } else {
      await prisma.order.update({
        where: { id: approval.entityId },
        data: { approvalStatus: "REJECTED" },
      });
    }
  }

  return prisma.approvalRequest.findUniqueOrThrow({
    where: { id: approvalId },
    include: {
      requestedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });
}
