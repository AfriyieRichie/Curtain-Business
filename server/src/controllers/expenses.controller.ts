import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess } from "../utils/response";
import { AppError } from "../middleware/errorHandler";

const FACTORY_SHARE = new Decimal("0.65");
const ADMIN_SHARE = new Decimal("0.35");

// ── Expense Categories ────────────────────────────────────────────────────────

export async function listCategories(_req: Request, res: Response) {
  const categories = await prisma.expenseCategory.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  sendSuccess(res, categories);
}

export async function createCategory(req: Request, res: Response) {
  const { name, type } = req.body;
  const category = await prisma.expenseCategory.create({
    data: { name, type: type ?? "SHARED" },
  });
  sendSuccess(res, category, undefined, 201);
}

export async function updateCategory(req: Request, res: Response) {
  const { id } = req.params;
  const { name, type } = req.body;
  const category = await prisma.expenseCategory.update({
    where: { id },
    data: {
      ...(name !== undefined && { name }),
      ...(type !== undefined && { type }),
    },
  });
  sendSuccess(res, category);
}

export async function deleteCategory(req: Request, res: Response) {
  const { id } = req.params;
  const inUse = await prisma.expense.count({ where: { categoryId: id } });
  if (inUse > 0) throw new AppError(400, "Category is in use and cannot be deleted. Remove linked expenses first.");
  await prisma.expenseCategory.delete({ where: { id } });
  sendSuccess(res, { deleted: true });
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function listExpenses(req: Request, res: Response) {
  const { from, to, type, categoryId } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const expenses = await prisma.expense.findMany({
    where: {
      ...(type && { type: type as never }),
      ...(categoryId && { categoryId }),
      ...(Object.keys(dateFilter).length && { date: dateFilter }),
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 1000,
  });

  sendSuccess(res, expenses);
}

export async function createExpense(req: Request, res: Response) {
  const { date, description, amountGhs, type, categoryId, notes } = req.body;
  const userId = req.auth!.userId;

  const expense = await prisma.expense.create({
    data: {
      date: new Date(date),
      description,
      amountGhs: new Decimal(amountGhs),
      type,
      categoryId: categoryId || null,
      notes: notes || null,
      createdById: userId,
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  sendSuccess(res, expense, undefined, 201);
}

export async function updateExpense(req: Request, res: Response) {
  const { id } = req.params;
  const { date, description, amountGhs, type, categoryId, notes } = req.body;

  const expense = await prisma.expense.update({
    where: { id },
    data: {
      ...(date && { date: new Date(date) }),
      ...(description !== undefined && { description }),
      ...(amountGhs !== undefined && { amountGhs: new Decimal(amountGhs) }),
      ...(type !== undefined && { type }),
      categoryId: categoryId ?? null,
      notes: notes ?? null,
    },
    include: {
      category: { select: { id: true, name: true, type: true } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  sendSuccess(res, expense);
}

export async function deleteExpense(req: Request, res: Response) {
  const { id } = req.params;
  await prisma.expense.delete({ where: { id } });
  sendSuccess(res, { deleted: true });
}

// ── Overhead Summary ──────────────────────────────────────────────────────────

export async function getOverheadSummary(req: Request, res: Response) {
  const { from, to } = req.query as Record<string, string>;
  const dateFilter = {
    ...(from && { gte: new Date(from) }),
    ...(to && { lte: new Date(to) }),
  };

  const expenses = await prisma.expense.findMany({
    where: {
      ...(Object.keys(dateFilter).length && { date: dateFilter }),
    },
    select: { type: true, amountGhs: true },
  });

  let factoryTotal = new Decimal(0);
  let adminTotal = new Decimal(0);
  let sharedTotal = new Decimal(0);

  for (const e of expenses) {
    const amt = new Decimal(e.amountGhs.toString());
    if (e.type === "FACTORY") factoryTotal = factoryTotal.plus(amt);
    else if (e.type === "ADMIN") adminTotal = adminTotal.plus(amt);
    else sharedTotal = sharedTotal.plus(amt);
  }

  const sharedFactoryPortion = sharedTotal.mul(FACTORY_SHARE);
  const sharedAdminPortion = sharedTotal.mul(ADMIN_SHARE);
  const totalFactoryOverhead = factoryTotal.plus(sharedFactoryPortion);
  const totalAdminOverhead = adminTotal.plus(sharedAdminPortion);

  const capacitySetting = await prisma.businessSetting.findUnique({
    where: { key: "production.monthlyCapacityHours" },
  });
  const capacityHours = new Decimal(capacitySetting?.value ?? "0");

  const suggestedRate = capacityHours.gt(0)
    ? totalFactoryOverhead.div(capacityHours).toDecimalPlaces(4)
    : null;

  sendSuccess(res, {
    factoryTotal: factoryTotal.toDecimalPlaces(4).toString(),
    adminTotal: adminTotal.toDecimalPlaces(4).toString(),
    sharedTotal: sharedTotal.toDecimalPlaces(4).toString(),
    sharedFactoryPortion: sharedFactoryPortion.toDecimalPlaces(4).toString(),
    sharedAdminPortion: sharedAdminPortion.toDecimalPlaces(4).toString(),
    totalFactoryOverhead: totalFactoryOverhead.toDecimalPlaces(4).toString(),
    totalAdminOverhead: totalAdminOverhead.toDecimalPlaces(4).toString(),
    capacityHours: capacityHours.toString(),
    suggestedOverheadRate: suggestedRate?.toString() ?? null,
    expenseCount: expenses.length,
  });
}

export async function applyOverheadRate(req: Request, res: Response) {
  const { overheadRate, capacityHours } = req.body;

  const rate = new Decimal(overheadRate).toDecimalPlaces(4).toString();

  await prisma.businessSetting.upsert({
    where: { key: "production.overheadRateGhs" },
    create: { key: "production.overheadRateGhs", value: rate },
    update: { value: rate },
  });

  if (capacityHours !== undefined) {
    const hours = new Decimal(capacityHours).toDecimalPlaces(2).toString();
    await prisma.businessSetting.upsert({
      where: { key: "production.monthlyCapacityHours" },
      create: { key: "production.monthlyCapacityHours", value: hours },
      update: { value: hours },
    });
  }

  sendSuccess(res, { applied: true, overheadRateGhs: rate });
}
