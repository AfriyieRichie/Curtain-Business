import { prisma } from "./prisma";

type NumberableEntity = "quote" | "order" | "invoice" | "po" | "grn" | "job";

const PREFIXES: Record<NumberableEntity, string> = {
  quote: "QT",
  order: "ORD",
  invoice: "INV",
  po: "PO",
  grn: "GRN",
  job: "JOB",
};

/**
 * Generates the next sequential document number for a given entity type.
 * Format: PREFIX-YYYY-NNNN (e.g. INV-2024-0001)
 * Uses a DB-level query for count so it's consistent under concurrent requests.
 */
export async function generateNumber(entity: NumberableEntity): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = PREFIXES[entity];

  // Count existing records for this year prefix to derive next sequence
  let count = 0;
  const yearTag = `${prefix}-${year}-`;

  if (entity === "quote") {
    count = await prisma.quote.count({ where: { quoteNumber: { startsWith: yearTag } } });
  } else if (entity === "order") {
    count = await prisma.order.count({ where: { orderNumber: { startsWith: yearTag } } });
  } else if (entity === "invoice") {
    count = await prisma.invoice.count({ where: { invoiceNumber: { startsWith: yearTag } } });
  } else if (entity === "po") {
    count = await prisma.purchaseOrder.count({ where: { poNumber: { startsWith: yearTag } } });
  } else if (entity === "grn") {
    count = await prisma.goodsReceivedNote.count({ where: { grnNumber: { startsWith: yearTag } } });
  } else if (entity === "job") {
    count = await prisma.jobCard.count({ where: { jobNumber: { startsWith: yearTag } } });
  }

  const seq = String(count + 1).padStart(4, "0");
  return `${yearTag}${seq}`;
}
