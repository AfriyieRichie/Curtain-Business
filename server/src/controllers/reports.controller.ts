import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess } from "../utils/response";

// ── Dashboard KPIs ────────────────────────────────────────────────────────────

export async function getDashboard(_req: Request, res: Response) {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    totalCustomers,
    activeOrders,
    monthlyRevenue,
    lowStockCount,
    unpaidInvoices,
    pendingJobCards,
  ] = await Promise.all([
    prisma.customer.count(),
    prisma.order.count({ where: { status: { in: ["PENDING", "CONFIRMED", "IN_PRODUCTION"] } } }),
    prisma.invoice.aggregate({
      _sum: { totalGhs: true },
      where: { createdAt: { gte: startOfMonth }, status: { not: "CANCELLED" } },
    }),
    prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM materials
      WHERE is_active = true AND current_stock <= minimum_stock
    `,
    prisma.invoice.aggregate({
      _sum: { balanceGhs: true },
      where: { status: { in: ["SENT", "PARTIAL", "OVERDUE"] } },
    }),
    prisma.jobCard.count({ where: { status: { in: ["PENDING", "IN_PROGRESS"] } } }),
  ]);

  sendSuccess(res, {
    totalCustomers,
    activeOrders,
    monthlyRevenueGhs: monthlyRevenue._sum.totalGhs?.toString() ?? "0",
    lowStockCount: Number((lowStockCount as [{ count: bigint }])[0].count),
    totalOutstandingGhs: unpaidInvoices._sum.balanceGhs?.toString() ?? "0",
    pendingJobCards,
  });
}

// ── Sales Report ──────────────────────────────────────────────────────────────

export async function getSalesReport(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { not: "CANCELLED" },
      ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
    },
    include: {
      customer: { select: { id: true, name: true } },
      payments: { select: { amountGhs: true, paymentDate: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totals = invoices.reduce(
    (acc, inv) => ({
      totalGhs: acc.totalGhs.plus(new Decimal(inv.totalGhs.toString())),
      totalPaid: acc.totalPaid.plus(new Decimal(inv.amountPaidGhs.toString())),
      totalOutstanding: acc.totalOutstanding.plus(new Decimal(inv.balanceGhs.toString())),
      totalDiscountGhs: acc.totalDiscountGhs.plus(new Decimal(inv.discountAmountGhs.toString())),
    }),
    { totalGhs: new Decimal(0), totalPaid: new Decimal(0), totalOutstanding: new Decimal(0), totalDiscountGhs: new Decimal(0) }
  );

  sendSuccess(res, {
    totals: {
      totalGhs: totals.totalGhs.toString(),
      totalPaid: totals.totalPaid.toString(),
      totalOutstanding: totals.totalOutstanding.toString(),
      totalDiscountGhs: totals.totalDiscountGhs.toString(),
    },
    invoices,
  });
}

// ── Job Profitability ─────────────────────────────────────────────────────────

export async function getProfitabilityReport(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const jobCards = await prisma.jobCard.findMany({
    where: {
      status: "COMPLETED",
      ...(Object.keys(dateFilter).length && { completedAt: dateFilter }),
    },
    include: {
      order: { select: { orderNumber: true, totalGhs: true } },
      materials: {
        where: { isIssued: true },
        include: { material: { select: { unitCostGhs: true } } },
      },
    },
  });

  const rows = jobCards.map((jc) => {
    const materialCost = jc.materials.reduce((sum, m) => {
      const qty = new Decimal(m.issuedQty?.toString() ?? m.requiredQty.toString());
      return sum.plus(qty.mul(new Decimal(m.material.unitCostGhs.toString())));
    }, new Decimal(0));

    const labourCost = new Decimal(jc.labourCostGhs.toString());
    const machineCost = new Decimal(jc.machineCostGhs.toString());
    const overheadCost = new Decimal(jc.overheadCostGhs.toString());
    const totalProductionCost = materialCost.plus(labourCost).plus(machineCost).plus(overheadCost);

    const revenue = new Decimal(jc.order.totalGhs.toString());
    const grossProfit = revenue.minus(totalProductionCost);
    const margin = revenue.gt(0) ? grossProfit.div(revenue).mul(100).toDecimalPlaces(2) : new Decimal(0);

    return {
      jobCardId: jc.id,
      orderNumber: jc.order.orderNumber,
      revenueGhs: revenue.toString(),
      materialCostGhs: materialCost.toString(),
      labourCostGhs: labourCost.toString(),
      machineCostGhs: machineCost.toString(),
      overheadCostGhs: overheadCost.toString(),
      totalProductionCostGhs: totalProductionCost.toString(),
      grossProfitGhs: grossProfit.toString(),
      marginPct: margin.toString(),
    };
  });

  sendSuccess(res, rows);
}

// ── Inventory Valuation (alias for inventory controller) ──────────────────────

export async function getInventoryReport(_req: Request, res: Response) {
  const materials = await prisma.material.findMany({
    where: { isActive: true },
    include: { category: true },
    orderBy: { code: "asc" },
  });

  let totalGhs = new Decimal(0);
  let totalUsd = new Decimal(0);

  const items = materials.map((m) => {
    const stock = new Decimal(m.currentStock.toString());
    const lineGhs = stock.mul(new Decimal(m.unitCostGhs.toString())).toDecimalPlaces(4);
    // Derive USD from GHS ÷ exchange rate so landed costs (GHS-only) are included
    const rate = new Decimal(m.exchangeRateUsed.toString());
    const lineUsd = rate.gt(0)
      ? lineGhs.div(rate).toDecimalPlaces(4)
      : stock.mul(new Decimal(m.unitCostUsd.toString())).toDecimalPlaces(4);
    totalGhs = totalGhs.plus(lineGhs);
    totalUsd = totalUsd.plus(lineUsd);
    return { ...m, lineValueGhs: lineGhs.toString(), lineValueUsd: lineUsd.toString() };
  });

  sendSuccess(res, {
    totalGhs: totalGhs.toDecimalPlaces(4).toString(),
    totalUsd: totalUsd.toDecimalPlaces(4).toString(),
    items,
  });
}

// ── Stock Movements ───────────────────────────────────────────────────────────

export async function getStockMovementsReport(req: Request, res: Response) {
  const { from, to, materialId, movementType } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const movements = await prisma.stockMovement.findMany({
    where: {
      ...(materialId && { materialId }),
      ...(movementType && { movementType: movementType as never }),
      ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
    },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 500,
  });

  sendSuccess(res, movements);
}

// ── Purchases Report ──────────────────────────────────────────────────────────

export async function getPurchasesReport(req: Request, res: Response) {
  const { from, to, supplierId } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const pos = await prisma.purchaseOrder.findMany({
    where: {
      ...(supplierId && { supplierId }),
      ...(Object.keys(dateFilter).length && { createdAt: dateFilter }),
    },
    include: {
      supplier: { select: { id: true, name: true } },
      _count: { select: { items: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const totalValue = pos.reduce(
    (acc, po) => acc.plus(new Decimal(po.total.toString())),
    new Decimal(0)
  );

  sendSuccess(res, {
    totals: { total: totalValue.toString() },
    orders: pos,
  });
}

// ── Chart Data ────────────────────────────────────────────────────────────────

export async function getChartData(_req: Request, res: Response) {
  const now = new Date();

  // Last 6 months revenue
  const months: { month: string; revenueGhs: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    const agg = await prisma.invoice.aggregate({
      _sum: { totalGhs: true },
      where: { status: { not: "CANCELLED" }, createdAt: { gte: start, lt: end } },
    });
    months.push({
      month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
      revenueGhs: agg._sum.totalGhs?.toString() ?? "0",
    });
  }

  // Top 5 materials by stock value
  const topMaterials = await prisma.$queryRaw<Array<{ code: string; name: string; value: number }>>`
    SELECT code, name, ROUND(CAST(current_stock AS numeric) * CAST(unit_cost_ghs AS numeric), 2) AS value
    FROM materials
    WHERE is_active = true
    ORDER BY value DESC
    LIMIT 5
  `;

  // Job card status breakdown
  const jobStatusRaw = await prisma.jobCard.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const jobStatus = jobStatusRaw.map((r) => ({ status: r.status, count: r._count._all }));

  sendSuccess(res, { revenueTrend: months, topMaterials, jobStatus });
}

// ── VAT Report ────────────────────────────────────────────────────────────────

export async function getVatReport(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const invoices = await prisma.invoice.findMany({
    where: {
      status: { notIn: ["CANCELLED", "DRAFT"] },
      taxAmountGhs: { gt: 0 },
      ...(Object.keys(dateFilter).length && { issueDate: dateFilter }),
    },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { issueDate: "desc" },
  });

  const totals = invoices.reduce(
    (acc, inv) => ({
      subtotalGhs: acc.subtotalGhs.plus(new Decimal(inv.subtotalGhs.toString())),
      taxAmountGhs: acc.taxAmountGhs.plus(new Decimal(inv.taxAmountGhs.toString())),
      totalGhs: acc.totalGhs.plus(new Decimal(inv.totalGhs.toString())),
    }),
    { subtotalGhs: new Decimal(0), taxAmountGhs: new Decimal(0), totalGhs: new Decimal(0) }
  );

  sendSuccess(res, {
    totals: {
      subtotalGhs: totals.subtotalGhs.toString(),
      taxAmountGhs: totals.taxAmountGhs.toString(),
      totalGhs: totals.totalGhs.toString(),
    },
    invoices,
  });
}

// ── Variance Analysis ─────────────────────────────────────────────────────────

export async function getVarianceReport(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const [labourRateSetting, overheadRateSetting] = await Promise.all([
    prisma.businessSetting.findUnique({ where: { key: "production.labourRateGhs" } }),
    prisma.businessSetting.findUnique({ where: { key: "production.overheadRateGhs" } }),
  ]);
  const labourRate = new Decimal(labourRateSetting?.value ?? "0");
  const overheadRate = new Decimal(overheadRateSetting?.value ?? "0");

  const jobCards = await prisma.jobCard.findMany({
    where: {
      status: "COMPLETED",
      ...(Object.keys(dateFilter).length && { completedAt: dateFilter }),
    },
    include: {
      order: {
        select: {
          orderNumber: true,
          items: { select: { id: true, windowLabel: true, lineCostGhs: true } },
        },
      },
      materials: {
        where: { isIssued: true },
        include: { material: { select: { unitCostGhs: true } } },
      },
    },
    orderBy: { completedAt: "desc" },
  });

  const rows = jobCards.map((jc) => {
    // Standard costs
    const orderItem = jc.orderItemId
      ? jc.order.items.find((i) => i.id === jc.orderItemId)
      : jc.order.items[0]; // fallback for legacy job cards without orderItemId

    const stdMaterialCost = orderItem
      ? new Decimal(orderItem.lineCostGhs.toString())
      : new Decimal(0);

    const stdLabourHours = new Decimal(jc.standardLabourHours.toString());
    const stdLabourCost = stdLabourHours.mul(labourRate);
    const stdOverheadCost = stdLabourHours.mul(overheadRate);
    const stdTotalCost = stdMaterialCost.plus(stdLabourCost).plus(stdOverheadCost);

    // Actual costs
    const actMaterialCost = jc.materials.reduce((sum, m) => {
      const qty = new Decimal(m.issuedQty.toString());
      return sum.plus(qty.mul(new Decimal(m.material.unitCostGhs.toString())));
    }, new Decimal(0));
    const actLabourCost = new Decimal(jc.labourCostGhs.toString());
    const actOverheadCost = new Decimal(jc.overheadCostGhs.toString());
    const actTotalCost = actMaterialCost.plus(actLabourCost).plus(actOverheadCost);

    // Variances (positive = over standard / unfavourable)
    const materialVariance = actMaterialCost.minus(stdMaterialCost);
    const labourVariance = actLabourCost.minus(stdLabourCost);
    const overheadVariance = actOverheadCost.minus(stdOverheadCost);
    const totalVariance = actTotalCost.minus(stdTotalCost);

    return {
      jobCardId: jc.id,
      jobNumber: jc.jobNumber,
      orderNumber: jc.order.orderNumber,
      windowLabel: orderItem?.windowLabel ?? "—",
      completedAt: jc.completedAt,
      standardLabourHours: stdLabourHours.toFixed(2),
      // Standard
      stdMaterialCost: stdMaterialCost.toFixed(4),
      stdLabourCost: stdLabourCost.toFixed(4),
      stdOverheadCost: stdOverheadCost.toFixed(4),
      stdTotalCost: stdTotalCost.toFixed(4),
      // Actual
      actMaterialCost: actMaterialCost.toFixed(4),
      actLabourCost: actLabourCost.toFixed(4),
      actOverheadCost: actOverheadCost.toFixed(4),
      actTotalCost: actTotalCost.toFixed(4),
      // Variance
      materialVariance: materialVariance.toFixed(4),
      labourVariance: labourVariance.toFixed(4),
      overheadVariance: overheadVariance.toFixed(4),
      totalVariance: totalVariance.toFixed(4),
    };
  });

  // Summary totals
  const summary = rows.reduce(
    (acc, r) => ({
      stdTotal: acc.stdTotal.plus(r.stdTotalCost),
      actTotal: acc.actTotal.plus(r.actTotalCost),
      totalVariance: acc.totalVariance.plus(r.totalVariance),
    }),
    { stdTotal: new Decimal(0), actTotal: new Decimal(0), totalVariance: new Decimal(0) }
  );

  sendSuccess(res, {
    summary: {
      stdTotalCost: summary.stdTotal.toFixed(4),
      actTotalCost: summary.actTotal.toFixed(4),
      totalVariance: summary.totalVariance.toFixed(4),
    },
    rows,
  });
}

// ── Aged Debtors ──────────────────────────────────────────────────────────────

export async function getAgedDebtors(_req: Request, res: Response) {
  const now = new Date();

  const invoices = await prisma.invoice.findMany({
    where: { status: { in: ["SENT", "PARTIAL", "OVERDUE"] }, balanceGhs: { gt: 0 } },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { dueDate: "asc" },
  });

  const buckets = { current: new Decimal(0), days30: new Decimal(0), days60: new Decimal(0), days90plus: new Decimal(0) };
  const rows = invoices.map((inv) => {
    const balance = new Decimal(inv.balanceGhs.toString());
    const daysOverdue = inv.dueDate
      ? Math.max(0, Math.floor((now.getTime() - inv.dueDate.getTime()) / 86400000))
      : 0;

    if (daysOverdue === 0) buckets.current = buckets.current.plus(balance);
    else if (daysOverdue <= 30) buckets.days30 = buckets.days30.plus(balance);
    else if (daysOverdue <= 60) buckets.days60 = buckets.days60.plus(balance);
    else buckets.days90plus = buckets.days90plus.plus(balance);

    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customer,
      dueDate: inv.dueDate,
      balanceGhs: balance.toString(),
      daysOverdue,
    };
  });

  sendSuccess(res, {
    summary: {
      current: buckets.current.toString(),
      "1-30": buckets.days30.toString(),
      "31-60": buckets.days60.toString(),
      "90+": buckets.days90plus.toString(),
    },
    rows,
  });
}
