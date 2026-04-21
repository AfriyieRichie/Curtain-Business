import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { nextDocNumber } from "../services/doc-number.service";

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function listInvoices(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { customerId, status, search } = req.query as Record<string, string>;

  const where: object = {
    ...(customerId && { customerId }),
    ...(status && { status }),
    ...(search && {
      OR: [
        { invoiceNumber: { contains: search, mode: "insensitive" } },
        { customer: { name: { contains: search, mode: "insensitive" } } },
      ],
    }),
  };

  const [invoices, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: { customer: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invoice.count({ where }),
  ]);

  sendPaginated(res, invoices, { page, limit, total });
}

export async function getInvoice(req: Request, res: Response) {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      customer: true,
      order: { select: { id: true, orderNumber: true } },
      items: { include: { orderItem: { include: { curtainType: true } } } },
      payments: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  sendSuccess(res, invoice);
}

export async function generateInvoice(req: Request, res: Response) {
  const { orderId, dueDate, notes } = req.body as {
    orderId: string; dueDate?: string; notes?: string;
  };

  const order = await prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    include: { items: true },
  });

  if (order.invoice) {
    throw new AppError(400, "An invoice already exists for this order.");
  }

  const invoiceNumber = await nextDocNumber("INV");

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: order.customerId,
        orderId: order.id,
        exchangeRateAtCreation: order.exchangeRateAtCreation,
        subtotalGhs: order.totalGhs,
        totalGhs: order.totalGhs,
        amountPaid: order.depositAmount,
        balanceDue: new Decimal(order.totalGhs.toString()).minus(new Decimal(order.depositAmount.toString())),
        dueDate: dueDate ? new Date(dueDate) : undefined,
        notes,
        createdById: req.auth!.userId,
        items: {
          create: order.items.map((oi) => ({
            orderItemId: oi.id,
            description: oi.description ?? `${oi.widthCm}cm × ${oi.dropCm}cm curtain`,
            quantity: oi.quantity,
            unitPriceGhs: oi.unitPriceGhs,
            lineTotalGhs: oi.lineTotalGhs,
          })),
        },
      },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });

    // If a deposit was already paid, record it as a payment
    if (new Decimal(order.depositAmount.toString()).gt(0)) {
      await tx.payment.create({
        data: {
          invoiceId: inv.id,
          amountGhs: order.depositAmount,
          method: "CASH",
          notes: "Deposit recorded on order",
          recordedById: req.auth!.userId,
        },
      });
    }

    await tx.order.update({ where: { id: order.id }, data: { status: "DELIVERED" } });

    return inv;
  });

  sendSuccess(res, invoice, "Invoice generated.", 201);
}

export async function updateInvoice(req: Request, res: Response) {
  const { dueDate, notes, status } = req.body as {
    dueDate?: string; notes?: string; status?: string;
  };
  const invoice = await prisma.invoice.update({
    where: { id: req.params.id },
    data: {
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : null }),
      ...(notes !== undefined && { notes }),
      ...(status && { status: status as never }),
    },
  });
  sendSuccess(res, invoice, "Invoice updated.");
}

// ── Payments ──────────────────────────────────────────────────────────────────

export async function recordPayment(req: Request, res: Response) {
  const { amountGhs, method, reference, notes, paidAt } = req.body as {
    amountGhs: string; method: string; reference?: string; notes?: string; paidAt?: string;
  };

  const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id: req.params.id } });

  if (invoice.status === "PAID") {
    throw new AppError(400, "Invoice is already fully paid.");
  }

  const payment = await prisma.$transaction(async (tx) => {
    const p = await tx.payment.create({
      data: {
        invoiceId: invoice.id,
        amountGhs: new Decimal(amountGhs),
        method: method as never,
        reference,
        notes,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
        recordedById: req.auth!.userId,
      },
    });

    // Recalculate balance
    const allPayments = await tx.payment.findMany({ where: { invoiceId: invoice.id } });
    const totalPaid = allPayments.reduce(
      (sum, pay) => sum.plus(new Decimal(pay.amountGhs.toString())),
      new Decimal(0)
    );
    const balance = new Decimal(invoice.totalGhs.toString()).minus(totalPaid);
    const newStatus = balance.lte(0) ? "PAID" : "PARTIAL";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { amountPaid: totalPaid, balanceDue: balance.gte(0) ? balance : new Decimal(0), status: newStatus as never },
    });

    return p;
  });

  sendSuccess(res, payment, "Payment recorded.", 201);
}

export async function listPayments(req: Request, res: Response) {
  const payments = await prisma.payment.findMany({
    where: { invoiceId: req.params.id },
    orderBy: { paidAt: "desc" },
    include: { recordedBy: { select: { id: true, name: true } } },
  });
  sendSuccess(res, payments);
}
