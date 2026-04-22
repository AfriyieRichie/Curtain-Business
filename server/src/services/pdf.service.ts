import PDFDocument from "pdfkit";
import { prisma } from "../utils/prisma";

type PDFBuffer = Promise<Buffer>;

function createDoc() {
  return new PDFDocument({ margin: 50, size: "A4" });
}

function bufferDoc(doc: PDFKit.PDFDocument): PDFBuffer {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function drawHeader(doc: PDFKit.PDFDocument, settings: Record<string, string>) {
  const name = settings["business.name"] ?? "Curtains ERP";
  const phone = settings["business.phone"] ?? "";
  const email = settings["business.email"] ?? "";
  const address = settings["business.address"] ?? "";

  doc.fontSize(20).font("Helvetica-Bold").text(name, 50, 50);
  doc.fontSize(9).font("Helvetica").fillColor("#555555");
  if (address) doc.text(address);
  if (phone) doc.text(phone);
  if (email) doc.text(email);
  doc.fillColor("#000000");
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").lineWidth(1).stroke();
  doc.moveDown(0.5);
}

function twoCol(doc: PDFKit.PDFDocument, left: string, right: string, y: number) {
  doc.fontSize(10).font("Helvetica").text(left, 50, y, { width: 247 });
  doc.text(right, 297, y, { width: 247, align: "right" });
}

function tableHeader(doc: PDFKit.PDFDocument, cols: { label: string; x: number; width: number; align?: "left" | "right" }[]) {
  const y = doc.y;
  doc.rect(50, y, 495, 18).fill("#f3f4f6");
  doc.fillColor("#111827").fontSize(9).font("Helvetica-Bold");
  cols.forEach((c) => doc.text(c.label, c.x, y + 4, { width: c.width, align: c.align ?? "left" }));
  doc.fillColor("#000000").font("Helvetica");
  doc.moveDown(0.1);
  doc.y = y + 20;
}

async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.businessSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// ── Invoice PDF ───────────────────────────────────────────────────────────────

export async function generateInvoicePDF(invoiceId: string): PDFBuffer {
  const invoice = await prisma.invoice.findUniqueOrThrow({
    where: { id: invoiceId },
    include: {
      customer: true,
      items: true,
      payments: true,
      order: { select: { orderNumber: true } },
    },
  });

  const settings = await getSettings();
  const doc = createDoc();
  const buf = bufferDoc(doc);

  drawHeader(doc, settings);

  // Invoice title + meta
  doc.fontSize(16).font("Helvetica-Bold").text("INVOICE", { align: "right" });
  doc.fontSize(10).font("Helvetica");
  const metaY = doc.y;
  doc.text(`Invoice #: ${invoice.invoiceNumber}`, 297, metaY, { width: 247, align: "right" });
  doc.text(`Date: ${new Date(invoice.issueDate).toLocaleDateString("en-GB")}`, { align: "right" });
  if (invoice.dueDate) doc.text(`Due: ${new Date(invoice.dueDate).toLocaleDateString("en-GB")}`, { align: "right" });
  if (invoice.order) doc.text(`Order: ${invoice.order.orderNumber}`, { align: "right" });

  // Bill To
  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica-Bold").text("BILL TO", 50, doc.y);
  doc.font("Helvetica").fontSize(10);
  doc.text(invoice.customer.name);
  if (invoice.customer.phone) doc.text(invoice.customer.phone);
  if (invoice.customer.email) doc.text(invoice.customer.email);
  if (invoice.customer.address) doc.text(invoice.customer.address);

  // Items table
  doc.moveDown(1);
  tableHeader(doc, [
    { label: "Description", x: 55, width: 250 },
    { label: "Qty", x: 305, width: 50, align: "right" },
    { label: "Unit", x: 355, width: 40 },
    { label: "Unit Price", x: 395, width: 80, align: "right" },
    { label: "Total", x: 475, width: 65, align: "right" },
  ]);

  doc.fontSize(9).font("Helvetica");
  invoice.items.forEach((item, i) => {
    const rowY = doc.y;
    if (i % 2 === 1) doc.rect(50, rowY, 495, 16).fill("#f9fafb");
    doc.fillColor("#111827");
    doc.text(item.description, 55, rowY + 3, { width: 250 });
    doc.text(Number(item.quantity).toFixed(2), 305, rowY + 3, { width: 50, align: "right" });
    doc.text(item.unit, 355, rowY + 3, { width: 40 });
    doc.text(`GHS ${Number(item.unitPriceGhs).toFixed(2)}`, 395, rowY + 3, { width: 80, align: "right" });
    doc.text(`GHS ${Number(item.lineTotalGhs).toFixed(2)}`, 475, rowY + 3, { width: 65, align: "right" });
    doc.y = rowY + 18;
  });

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  // Totals
  const totY = doc.y;
  doc.fontSize(10).font("Helvetica").text("Subtotal:", 380, totY, { width: 90, align: "right" });
  doc.text(`GHS ${Number(invoice.subtotalGhs).toFixed(2)}`, 470, totY, { width: 70, align: "right" });

  if (Number(invoice.taxAmountGhs) > 0) {
    doc.text(`Tax (${Number(invoice.taxRate).toFixed(0)}%):`, 380, doc.y, { width: 90, align: "right" });
    doc.text(`GHS ${Number(invoice.taxAmountGhs).toFixed(2)}`, 470, doc.y, { width: 70, align: "right" });
  }

  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(12);
  doc.text("TOTAL:", 380, doc.y, { width: 90, align: "right" });
  doc.text(`GHS ${Number(invoice.totalGhs).toFixed(2)}`, 470, doc.y, { width: 70, align: "right" });

  doc.moveDown(0.3);
  doc.font("Helvetica").fontSize(10).fillColor("#16a34a");
  doc.text(`Amount Paid: GHS ${Number(invoice.amountPaidGhs).toFixed(2)}`, 380, doc.y, { width: 160, align: "right" });
  const balance = Number(invoice.balanceGhs);
  if (balance > 0) {
    doc.fillColor("#dc2626");
    doc.text(`Balance Due: GHS ${balance.toFixed(2)}`, { align: "right" });
  }
  doc.fillColor("#000000");

  // Payment history
  if (invoice.payments.length > 0) {
    doc.moveDown(1);
    doc.fontSize(9).font("Helvetica-Bold").text("PAYMENT HISTORY");
    doc.font("Helvetica");
    invoice.payments.forEach((p) => {
      doc.text(
        `${new Date(p.paymentDate).toLocaleDateString("en-GB")} — ${p.paymentMethod.replace("_", " ")} — GHS ${Number(p.amountGhs).toFixed(2)}${p.reference ? ` (${p.reference})` : ""}`,
      );
    });
  }

  // Footer
  const footer = settings["business.invoiceFooter"] ?? "Thank you for your business!";
  doc.moveDown(2);
  doc.fontSize(9).fillColor("#6b7280").text(footer, { align: "center" });

  doc.end();
  return buf;
}

// ── Quote PDF ─────────────────────────────────────────────────────────────────

export async function generateQuotePDF(quoteId: string): PDFBuffer {
  const quote = await prisma.quote.findUniqueOrThrow({
    where: { id: quoteId },
    include: {
      customer: true,
      items: {
        include: {
          curtainType: true,
          fabricMaterial: { select: { name: true, code: true } },
          liningMaterial: { select: { name: true } },
        },
      },
    },
  });

  const settings = await getSettings();
  const doc = createDoc();
  const buf = bufferDoc(doc);

  drawHeader(doc, settings);

  doc.fontSize(16).font("Helvetica-Bold").text("QUOTATION", { align: "right" });
  doc.fontSize(10).font("Helvetica");
  doc.text(`Quote #: ${quote.quoteNumber}`, 297, doc.y, { width: 247, align: "right" });
  doc.text(`Date: ${new Date(quote.createdAt).toLocaleDateString("en-GB")}`, { align: "right" });
  if (quote.validUntil) doc.text(`Valid Until: ${new Date(quote.validUntil).toLocaleDateString("en-GB")}`, { align: "right" });
  doc.text(`Status: ${quote.status}`, { align: "right" });

  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica-Bold").text("PREPARED FOR");
  doc.font("Helvetica").fontSize(10).text(quote.customer.name);
  if (quote.customer.phone) doc.text(quote.customer.phone);
  if (quote.customer.email) doc.text(quote.customer.email);
  if (quote.customer.address) doc.text(quote.customer.address);

  doc.moveDown(1);
  tableHeader(doc, [
    { label: "Window / Room", x: 55, width: 130 },
    { label: "Type", x: 185, width: 80 },
    { label: "W×D (cm)", x: 265, width: 75, align: "right" },
    { label: "Qty", x: 340, width: 30, align: "right" },
    { label: "Fabric", x: 370, width: 90 },
    { label: "Price (GHS)", x: 460, width: 80, align: "right" },
  ]);

  doc.fontSize(9).font("Helvetica");
  quote.items.forEach((item, i) => {
    const rowY = doc.y;
    if (i % 2 === 1) doc.rect(50, rowY, 495, 16).fill("#f9fafb");
    doc.fillColor("#111827");
    doc.text(item.windowLabel ?? "—", 55, rowY + 3, { width: 130 });
    doc.text(item.curtainType.name, 185, rowY + 3, { width: 80 });
    doc.text(`${Number(item.widthCm).toFixed(0)}×${Number(item.dropCm).toFixed(0)}`, 265, rowY + 3, { width: 75, align: "right" });
    doc.text(Number(item.quantity).toFixed(0), 340, rowY + 3, { width: 30, align: "right" });
    doc.text(item.fabricMaterial?.code ?? "—", 370, rowY + 3, { width: 90 });
    doc.text(`GHS ${Number(item.lineTotalGhs).toFixed(2)}`, 460, rowY + 3, { width: 80, align: "right" });
    doc.y = rowY + 18;
  });

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  doc.fontSize(10).font("Helvetica-Bold").text("TOTAL:", 380, doc.y, { width: 90, align: "right" });
  doc.text(`GHS ${Number(quote.totalGhs).toFixed(2)}`, 470, doc.y, { width: 70, align: "right" });

  if (quote.notes) {
    doc.moveDown(1);
    doc.font("Helvetica-Bold").fontSize(9).text("NOTES");
    doc.font("Helvetica").text(quote.notes);
  }

  doc.moveDown(2);
  doc.fontSize(9).fillColor("#6b7280").text("Prices are valid for the period stated above. Exchange rate fluctuations may affect final GHS amounts.", { align: "center" });

  doc.end();
  return buf;
}

// ── Purchase Order PDF ────────────────────────────────────────────────────────

export async function generatePurchaseOrderPDF(poId: string): PDFBuffer {
  const po = await prisma.purchaseOrder.findUniqueOrThrow({
    where: { id: poId },
    include: {
      supplier: true,
      items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
      createdBy: { select: { id: true, name: true } },
    },
  });

  const settings = await getSettings();
  const doc = createDoc();
  const buf = bufferDoc(doc);

  drawHeader(doc, settings);

  doc.fontSize(16).font("Helvetica-Bold").text("PURCHASE ORDER", { align: "right" });
  doc.fontSize(10).font("Helvetica");
  doc.text(`PO #: ${po.poNumber}`, 297, doc.y, { width: 247, align: "right" });
  doc.text(`Date: ${new Date(po.orderDate).toLocaleDateString("en-GB")}`, { align: "right" });
  if (po.expectedDate) doc.text(`Expected: ${new Date(po.expectedDate).toLocaleDateString("en-GB")}`, { align: "right" });
  doc.text(`Status: ${po.status}`, { align: "right" });

  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica-Bold").text("SUPPLIER", 50, doc.y);
  doc.font("Helvetica").fontSize(10);
  doc.text(po.supplier.name);
  if (po.supplier.contactPerson) doc.text(po.supplier.contactPerson);
  if (po.supplier.phone) doc.text(po.supplier.phone);
  if (po.supplier.email) doc.text(po.supplier.email);
  if (po.supplier.address) doc.text(po.supplier.address);

  if (po.notes) {
    doc.moveDown(0.5);
    doc.fontSize(9).font("Helvetica-Bold").text("NOTES");
    doc.font("Helvetica").fontSize(10).text(po.notes);
  }

  doc.moveDown(1);
  tableHeader(doc, [
    { label: "Code", x: 55, width: 80 },
    { label: "Material", x: 135, width: 200 },
    { label: "Qty", x: 335, width: 55, align: "right" },
    { label: "Unit", x: 390, width: 40 },
    { label: "Unit Cost (USD)", x: 430, width: 65, align: "right" },
    { label: "Total (USD)", x: 495, width: 50, align: "right" },
  ]);

  doc.fontSize(9).font("Helvetica");
  po.items.forEach((item, i) => {
    const rowY = doc.y;
    if (i % 2 === 1) doc.rect(50, rowY, 495, 16).fill("#f9fafb");
    doc.fillColor("#111827");
    doc.text(item.material.code, 55, rowY + 3, { width: 80 });
    doc.text(item.material.name, 135, rowY + 3, { width: 200 });
    doc.text(Number(item.orderedQty).toFixed(2), 335, rowY + 3, { width: 55, align: "right" });
    doc.text(item.material.unit, 390, rowY + 3, { width: 40 });
    doc.text(Number(item.unitCost).toFixed(4), 430, rowY + 3, { width: 65, align: "right" });
    doc.text(Number(item.lineTotal).toFixed(2), 495, rowY + 3, { width: 50, align: "right" });
    doc.y = rowY + 18;
  });

  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.moveDown(0.5);

  const totY = doc.y;
  doc.fontSize(10).font("Helvetica").text("Subtotal:", 380, totY, { width: 90, align: "right" });
  doc.text(`USD ${Number(po.subtotal).toFixed(2)}`, 470, totY, { width: 70, align: "right" });
  doc.moveDown(0.2);
  doc.font("Helvetica-Bold").fontSize(12);
  doc.text("TOTAL:", 380, doc.y, { width: 90, align: "right" });
  doc.text(`USD ${Number(po.total).toFixed(2)}`, 470, doc.y, { width: 70, align: "right" });

  doc.moveDown(0.5);
  doc.font("Helvetica").fontSize(8).fillColor("#6b7280");
  doc.text("All amounts in USD. GHS equivalent calculated at time of goods receipt.", { align: "center" });

  doc.moveDown(1);
  const footer = settings["business.invoiceFooter"] ?? "Thank you for your business!";
  doc.fontSize(9).text(footer, { align: "center" });

  doc.end();
  return buf;
}

// ── Job Card PDF ──────────────────────────────────────────────────────────────

export async function generateJobCardPDF(jobCardId: string): PDFBuffer {
  const jc = await prisma.jobCard.findUniqueOrThrow({
    where: { id: jobCardId },
    include: {
      assignedTo: { select: { name: true } },
      order: {
        include: {
          customer: true,
          items: { include: { curtainType: true, fabricMaterial: { select: { name: true, code: true } }, liningMaterial: { select: { name: true } } } },
        },
      },
      materials: {
        include: { material: { select: { code: true, name: true, unit: true } } },
      },
    },
  });

  const settings = await getSettings();
  const doc = createDoc();
  const buf = bufferDoc(doc);

  drawHeader(doc, settings);

  doc.fontSize(16).font("Helvetica-Bold").text("JOB CARD", { align: "right" });
  doc.fontSize(10).font("Helvetica");
  doc.text(`Job #: ${jc.jobNumber}`, 297, doc.y, { width: 247, align: "right" });
  doc.text(`Order: ${jc.order.orderNumber}`, { align: "right" });
  doc.text(`Assigned To: ${jc.assignedTo?.name ?? "Unassigned"}`, { align: "right" });
  doc.text(`Status: ${jc.status}`, { align: "right" });

  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica-Bold").text("CUSTOMER");
  doc.font("Helvetica").fontSize(10).text(jc.order.customer.name);
  if (jc.order.customer.phone) doc.text(jc.order.customer.phone);

  // Order items (windows)
  doc.moveDown(1);
  doc.fontSize(10).font("Helvetica-Bold").text("WINDOWS TO PRODUCE");
  doc.moveDown(0.3);
  tableHeader(doc, [
    { label: "Window", x: 55, width: 140 },
    { label: "Type", x: 195, width: 90 },
    { label: "W (cm)", x: 285, width: 60, align: "right" },
    { label: "Drop (cm)", x: 345, width: 70, align: "right" },
    { label: "Fabric", x: 415, width: 125 },
  ]);

  doc.fontSize(9).font("Helvetica");
  jc.order.items.forEach((item, i) => {
    const rowY = doc.y;
    if (i % 2 === 1) doc.rect(50, rowY, 495, 16).fill("#f9fafb");
    doc.fillColor("#111827");
    doc.text(item.windowLabel ?? "—", 55, rowY + 3, { width: 140 });
    doc.text(item.curtainType.name, 195, rowY + 3, { width: 90 });
    doc.text(Number(item.widthCm).toFixed(0), 285, rowY + 3, { width: 60, align: "right" });
    doc.text(Number(item.dropCm).toFixed(0), 345, rowY + 3, { width: 70, align: "right" });
    doc.text(item.fabricMaterial?.code ?? "—", 415, rowY + 3, { width: 125 });
    doc.y = rowY + 18;
  });

  // Materials to issue
  doc.moveDown(1);
  doc.fontSize(10).font("Helvetica-Bold").text("MATERIALS TO ISSUE");
  doc.moveDown(0.3);
  tableHeader(doc, [
    { label: "Code", x: 55, width: 90 },
    { label: "Material", x: 145, width: 230 },
    { label: "Required", x: 375, width: 70, align: "right" },
    { label: "Unit", x: 445, width: 50 },
    { label: "Issued ✓", x: 495, width: 50, align: "right" },
  ]);

  doc.fontSize(9).font("Helvetica");
  jc.materials.forEach((m, i) => {
    const rowY = doc.y;
    if (i % 2 === 1) doc.rect(50, rowY, 495, 16).fill("#f9fafb");
    doc.fillColor("#111827");
    doc.text(m.material.code, 55, rowY + 3, { width: 90 });
    doc.text(m.material.name, 145, rowY + 3, { width: 230 });
    doc.text(Number(m.requiredQty).toFixed(3), 375, rowY + 3, { width: 70, align: "right" });
    doc.text(m.material.unit, 445, rowY + 3, { width: 50 });
    doc.text(m.isIssued ? "✓" : "□", 495, rowY + 3, { width: 50, align: "right" });
    doc.y = rowY + 18;
  });

  // Sign-off section
  doc.moveDown(2);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor("#e5e7eb").lineWidth(0.5).stroke();
  doc.moveDown(0.5);
  doc.fontSize(9).font("Helvetica");
  twoCol(doc, "Prepared by: _______________________", "Date: _______________", doc.y);
  doc.moveDown(1.5);
  twoCol(doc, "Quality Check: _______________________", "Date: _______________", doc.y);

  doc.end();
  return buf;
}
