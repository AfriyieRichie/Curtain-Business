/**
 * Atomic stock operations — all writes run inside a Prisma transaction.
 * Never call these from outside a request context without proper error handling.
 */

import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { AppError } from "../middleware/errorHandler";
import { recalcGHSCost, applyMarkup } from "../utils/currency";

/**
 * Issues a single JobCardMaterial line.
 * Atomically deducts from material.currentStock and creates a StockMovement.
 */
export async function issueJobCardMaterial(jobCardMaterialId: string, issuedById: string) {
  return prisma.$transaction(async (tx) => {
    const jcm = await tx.jobCardMaterial.findUniqueOrThrow({
      where: { id: jobCardMaterialId },
      include: { material: true, jobCard: true },
    });

    if (jcm.isIssued) throw new AppError(400, "Material already issued.");

    const required = new Decimal(jcm.requiredQty.toString());
    const inStock = new Decimal(jcm.material.currentStock.toString());

    if (inStock.lt(required)) {
      throw new AppError(422, `Insufficient stock for ${jcm.material.code}. Required: ${required}, In stock: ${inStock}`);
    }

    // Deduct stock
    await tx.material.update({
      where: { id: jcm.materialId },
      data: { currentStock: { decrement: required.toNumber() } },
    });

    // Record movement
    const movement = await tx.stockMovement.create({
      data: {
        materialId: jcm.materialId,
        movementType: "PRODUCTION_ISSUE",
        quantity: required.negated(),
        unitCostUsd: jcm.material.unitCostUsd,
        unitCostGhs: jcm.material.unitCostGhs,
        exchangeRateAtMovement: jcm.material.exchangeRateUsed,
        referenceId: jcm.jobCardId,
        referenceType: "JobCard",
        createdById: issuedById,
      },
    });

    // Mark the job card material as issued
    await tx.jobCardMaterial.update({
      where: { id: jobCardMaterialId },
      data: { isIssued: true, issuedQty: required, issuedAt: new Date(), issuedById },
    });

    return movement;
  });
}

/**
 * Manually adjusts stock for a material (damage, return, correction, etc.)
 */
export async function adjustStock(
  materialId: string,
  quantity: number,
  movementType: "MANUAL_ADJUSTMENT" | "DAMAGE" | "RETURN",
  userId: string,
  notes?: string
) {
  return prisma.$transaction(async (tx) => {
    const material = await tx.material.findUniqueOrThrow({ where: { id: materialId } });
    const newStock = new Decimal(material.currentStock.toString()).plus(quantity);

    if (newStock.lt(0)) {
      throw new AppError(422, `Adjustment would result in negative stock (${newStock}).`);
    }

    await tx.material.update({ where: { id: materialId }, data: { currentStock: newStock } });

    return tx.stockMovement.create({
      data: {
        materialId,
        movementType,
        quantity: new Decimal(quantity),
        unitCostUsd: material.unitCostUsd,
        unitCostGhs: material.unitCostGhs,
        exchangeRateAtMovement: material.exchangeRateUsed,
        notes,
        createdById: userId,
      },
    });
  });
}

/**
 * Receives a GRN — updates stock, updates material costs, closes PO line if fully received.
 * Runs entirely in a single atomic transaction.
 */
export async function receiveGRN(
  poId: string,
  grnNumber: string,
  exchangeRateAtReceipt: string,
  items: Array<{ poItemId: string; receivedQty: number; unitCostUsd: number }>,
  userId: string,
  landedCosts?: { freightCostUsd: string; clearingCostGhs: string; otherLandedGhs: string }
) {
  return prisma.$transaction(async (tx) => {
    const rate = new Decimal(exchangeRateAtReceipt);
    const [markupSetting] = await Promise.all([
      tx.businessSetting.findUnique({ where: { key: "currency.markupRatio" } }),
    ]);
    const markup = new Decimal(markupSetting?.value ?? "0.35");

    // Calculate total landed cost in GHS to distribute proportionally
    const freightGhs = landedCosts
      ? new Decimal(landedCosts.freightCostUsd).mul(rate)
      : new Decimal(0);
    const clearingGhs = landedCosts ? new Decimal(landedCosts.clearingCostGhs) : new Decimal(0);
    const otherGhs = landedCosts ? new Decimal(landedCosts.otherLandedGhs) : new Decimal(0);
    const totalLandedGhs = freightGhs.plus(clearingGhs).plus(otherGhs);

    // Pre-compute total GRN value in USD for proportional distribution
    const totalGrnUsd = items.reduce(
      (sum, i) => sum.plus(new Decimal(i.unitCostUsd).mul(new Decimal(i.receivedQty))),
      new Decimal(0)
    );

    // Create the GRN header
    const grn = await tx.goodsReceivedNote.create({
      data: {
        grnNumber,
        poId,
        receivedDate: new Date(),
        exchangeRateAtReceipt: rate,
        createdById: userId,
      },
    });

    const movements = [];

    for (const item of items) {
      const poItem = await tx.purchaseOrderItem.findUniqueOrThrow({
        where: { id: item.poItemId },
        include: { material: true },
      });

      const receivedQty = new Decimal(item.receivedQty);
      const unitCostUsd = new Decimal(item.unitCostUsd);
      const lineUsd = unitCostUsd.mul(receivedQty);

      // Base GHS cost from exchange rate
      const baseUnitCostGhs = recalcGHSCost(unitCostUsd, rate);

      // Allocate landed costs proportionally by USD line value
      const landedAllocationGhs = totalGrnUsd.gt(0) && totalLandedGhs.gt(0)
        ? totalLandedGhs.mul(lineUsd).div(totalGrnUsd)
        : new Decimal(0);
      const landedPerUnitGhs = receivedQty.gt(0) ? landedAllocationGhs.div(receivedQty) : new Decimal(0);
      const unitCostGhs = baseUnitCostGhs.plus(landedPerUnitGhs);

      // Weighted Average Cost: (existing_stock × existing_cost + received_qty × new_cost) ÷ total_qty
      const existingStock = new Decimal(poItem.material.currentStock.toString());
      const existingCostUsd = new Decimal(poItem.material.unitCostUsd.toString());
      const existingCostGhs = new Decimal(poItem.material.unitCostGhs.toString());
      const totalQty = existingStock.plus(receivedQty);
      const avgCostUsd = totalQty.gt(0)
        ? existingStock.mul(existingCostUsd).plus(receivedQty.mul(unitCostUsd)).div(totalQty)
        : unitCostUsd;
      // GHS WAC includes the landed cost allocation
      const avgCostGhs = totalQty.gt(0)
        ? existingStock.mul(existingCostGhs).plus(receivedQty.mul(unitCostGhs)).div(totalQty)
        : unitCostGhs;

      // GRN line records the actual received cost including landed allocation
      await tx.goodsReceivedItem.create({
        data: {
          grnId: grn.id,
          poItemId: item.poItemId,
          materialId: poItem.materialId,
          receivedQty,
          unitCostUsd,
          unitCostGhs,
        },
      });

      // Stock and material cost updated to weighted average (GHS WAC includes landed costs)
      await tx.material.update({
        where: { id: poItem.materialId },
        data: {
          currentStock: { increment: receivedQty.toNumber() },
          unitCostUsd: avgCostUsd,
          unitCostGhs: avgCostGhs,
          exchangeRateUsed: rate,
          sellingPriceGhs: applyMarkup(avgCostGhs, markup),
        },
      });

      // Record movement (unitCostGhs here includes the landed allocation)
      const movement = await tx.stockMovement.create({
        data: {
          materialId: poItem.materialId,
          movementType: "PURCHASE",
          quantity: receivedQty,
          unitCostUsd,
          unitCostGhs,
          exchangeRateAtMovement: rate,
          referenceId: grn.id,
          referenceType: "GRN",
          createdById: userId,
        },
      });
      movements.push(movement);

      // Update PO item received qty
      const newReceived = new Decimal(poItem.receivedQty.toString()).plus(receivedQty);
      await tx.purchaseOrderItem.update({
        where: { id: item.poItemId },
        data: { receivedQty: newReceived },
      });
    }

    // Update PO status based on whether all items are fully received
    const allItems = await tx.purchaseOrderItem.findMany({ where: { poId } });
    const allReceived = allItems.every((i) =>
      new Decimal(i.receivedQty.toString()).gte(new Decimal(i.orderedQty.toString()))
    );
    const anyReceived = allItems.some((i) => new Decimal(i.receivedQty.toString()).gt(0));

    await tx.purchaseOrder.update({
      where: { id: poId },
      data: { status: allReceived ? "RECEIVED" : anyReceived ? "PARTIALLY_RECEIVED" : "SENT" },
    });

    return { grn, movements };
  });
}
