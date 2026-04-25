import nodemailer from "nodemailer";
import { prisma } from "../utils/prisma";

function createTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587");
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
}

async function getBusinessName(): Promise<string> {
  const s = await prisma.businessSetting.findUnique({ where: { key: "business.name" } });
  return s?.value ?? "Curtains ERP";
}

async function getFromAddress(): Promise<string> {
  const name = await getBusinessName();
  return `"${name}" <${process.env.SMTP_USER ?? "noreply@example.com"}>`;
}

// ── Invoice delivery ──────────────────────────────────────────────────────────

export async function sendInvoiceEmail(invoiceId: string, pdfBuffer: Buffer): Promise<void> {
  const transport = createTransport();
  if (!transport) return;

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });

  if (!invoice.customer.email) return;

  const from = await getFromAddress();
  const businessName = await getBusinessName();

  await transport.sendMail({
    from,
    to: invoice.customer.email,
    subject: `Invoice ${invoice.invoiceNumber} from ${businessName}`,
    html: `
      <p>Dear ${invoice.customer.name},</p>
      <p>Please find attached invoice <strong>${invoice.invoiceNumber}</strong>
         for <strong>GHS ${Number(invoice.totalGhs).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</strong>.</p>
      <p>Balance due: <strong>GHS ${Number(invoice.balanceGhs).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</strong></p>
      <p>Due date: ${invoice.dueDate.toLocaleDateString("en-GH")}</p>
      <br/><p>Thank you for your business.</p>
      <p>${businessName}</p>
    `,
    attachments: [
      { filename: `${invoice.invoiceNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
    ],
  });
}

// ── Payment receipt ───────────────────────────────────────────────────────────

export async function sendPaymentReceiptEmail(invoiceId: string, amountGhs: string): Promise<void> {
  const transport = createTransport();
  if (!transport) return;

  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: { customer: true },
  });

  if (!invoice.customer.email) return;

  const from = await getFromAddress();
  const businessName = await getBusinessName();

  await transport.sendMail({
    from,
    to: invoice.customer.email,
    subject: `Payment received — ${invoice.invoiceNumber}`,
    html: `
      <p>Dear ${invoice.customer.name},</p>
      <p>We have received your payment of <strong>GHS ${Number(amountGhs).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</strong>
         for invoice <strong>${invoice.invoiceNumber}</strong>.</p>
      ${Number(invoice.balanceGhs) > 0
        ? `<p>Remaining balance: <strong>GHS ${Number(invoice.balanceGhs).toLocaleString("en-GH", { minimumFractionDigits: 2 })}</strong></p>`
        : "<p>Your account is now fully paid. Thank you!</p>"}
      <p>${businessName}</p>
    `,
  });
}

// ── Purchase Order delivery ───────────────────────────────────────────────────

export async function sendPurchaseOrderEmail(poId: string, pdfBuffer: Buffer): Promise<void> {
  const transport = createTransport();
  if (!transport) return;

  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: { supplier: true },
  });

  if (!po.supplier.email) return;

  const from = await getFromAddress();
  const businessName = await getBusinessName();

  await transport.sendMail({
    from,
    to: po.supplier.email,
    subject: `Purchase Order ${po.poNumber} from ${businessName}`,
    html: `
      <p>Dear ${po.supplier.contactPerson ?? po.supplier.name},</p>
      <p>Please find attached purchase order <strong>${po.poNumber}</strong>
         .</p>
      ${po.expectedDate ? `<p>Expected delivery: <strong>${new Date(po.expectedDate).toLocaleDateString("en-GB")}</strong></p>` : ""}
      <p>Please confirm receipt of this order at your earliest convenience.</p>
      <br/><p>Kind regards,</p>
      <p>${businessName}</p>
    `,
    attachments: [
      { filename: `${po.poNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
    ],
  });
}

// ── Low-stock alert ───────────────────────────────────────────────────────────

export async function sendLowStockAlert(
  materials: Array<{ code: string; name: string; currentStock: string; minimumStock: string }>
): Promise<void> {
  const transport = createTransport();
  if (!transport) return;

  const alertEmail = process.env.ALERT_EMAIL;
  if (!alertEmail) return;

  const from = await getFromAddress();
  const businessName = await getBusinessName();

  const rows = materials
    .map((m) => `<tr><td>${m.code}</td><td>${m.name}</td><td>${m.currentStock}</td><td>${m.minimumStock}</td></tr>`)
    .join("");

  await transport.sendMail({
    from,
    to: alertEmail,
    subject: `Low stock alert — ${materials.length} item(s) need reordering`,
    html: `
      <p>The following materials are at or below minimum stock levels:</p>
      <table border="1" cellpadding="6" style="border-collapse:collapse">
        <thead><tr><th>Code</th><th>Name</th><th>Current Stock</th><th>Minimum</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <br/><p>${businessName}</p>
    `,
  });
}
