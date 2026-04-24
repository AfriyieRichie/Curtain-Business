import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { nextDocNumber } from "../services/doc-number.service";
import { generateInvoicePDF } from "../services/pdf.service";
import { sendInvoiceEmail, sendPaymentReceiptEmail } from "../services/email.service";

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
      items: true,
      payments: { orderBy: { paymentDate: "asc" } },
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
    include: { items: { include: { fabricMaterial: true } }, invoices: true },
  });

  if (order.invoices.length > 0) {
    throw new AppError(400, "An invoice already exists for this order.");
  }

  const invoiceNumber = await nextDocNumber("INV");
  const defaultDueDate = new Date();
  defaultDueDate.setDate(defaultDueDate.getDate() + 30);

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        invoiceNumber,
        customerId: order.customerId,
        orderId: order.id,
        issueDate: new Date(),
        dueDate: dueDate ? new Date(dueDate) : defaultDueDate,
        exchangeRateSnapshot: order.exchangeRateSnapshot,
        subtotalGhs: order.totalGhs,
        totalGhs: order.totalGhs,
        amountPaidGhs: order.depositAmountGhs,
        balanceGhs: new Decimal(order.totalGhs.toString()).minus(new Decimal(order.depositAmountGhs.toString())).gte(0)
          ? new Decimal(order.totalGhs.toString()).minus(new Decimal(order.depositAmountGhs.toString()))
          : new Decimal(0),
        notes,
        items: {
          create: order.items.map((oi) => ({
            description: oi.description ?? `${oi.windowLabel} — ${Number(oi.widthCm).toFixed(0)}cm × ${Number(oi.dropCm).toFixed(0)}cm`,
            quantity: oi.quantity,
            unit: "SET",
            unitPriceGhs: oi.unitPriceGhs,
            lineTotalGhs: oi.lineTotalGhs,
            materialId: oi.fabricMaterialId,
            unitCostUsd: oi.lineCostUsd,
          })),
        },
      },
      include: { items: true, customer: { select: { id: true, name: true } } },
    });

    // Record deposit as first payment if applicable
    if (new Decimal(order.depositAmountGhs.toString()).gt(0)) {
      await tx.payment.create({
        data: {
          invoiceId: inv.id,
          amountGhs: order.depositAmountGhs,
          paymentMethod: "CASH",
          paymentDate: new Date(),
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
      ...(dueDate !== undefined && { dueDate: dueDate ? new Date(dueDate) : undefined }),
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
        paymentMethod: method as never,
        reference,
        notes,
        paymentDate: paidAt ? new Date(paidAt) : new Date(),
        recordedById: req.auth!.userId,
      },
    });

    const allPayments = await tx.payment.findMany({ where: { invoiceId: invoice.id } });
    const totalPaid = allPayments.reduce(
      (sum, pay) => sum.plus(new Decimal(pay.amountGhs.toString())),
      new Decimal(0)
    );
    const balance = new Decimal(invoice.totalGhs.toString()).minus(totalPaid);
    const newStatus = balance.lte(0) ? "PAID" : "PARTIAL";

    await tx.invoice.update({
      where: { id: invoice.id },
      data: {
        amountPaidGhs: totalPaid,
        balanceGhs: balance.gte(0) ? balance : new Decimal(0),
        status: newStatus as never,
      },
    });

    return p;
  });

  // Fire-and-forget email — don't block the API response
  sendPaymentReceiptEmail(invoice.id, amountGhs).catch(() => undefined);

  sendSuccess(res, payment, "Payment recorded.", 201);
}

export async function emailInvoice(req: Request, res: Response) {
  const pdf = await generateInvoicePDF(req.params.id);
  try {
    await sendInvoiceEmail(req.params.id, pdf);
    sendSuccess(res, null, "Invoice emailed to customer.");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "SMTP error";
    throw new AppError(500, `Email could not be delivered: ${msg}. Check SMTP settings.`);
  }
}

export async function listPayments(req: Request, res: Response) {
  const payments = await prisma.payment.findMany({
    where: { invoiceId: req.params.id },
    orderBy: { paymentDate: "desc" },
    include: { recordedBy: { select: { id: true, name: true } } },
  });
  sendSuccess(res, payments);
}
