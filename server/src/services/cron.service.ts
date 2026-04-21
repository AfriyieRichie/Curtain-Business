import { prisma } from "../utils/prisma";
import Decimal from "decimal.js";

async function markOverdueInvoices() {
  const now = new Date();
  await prisma.invoice.updateMany({
    where: {
      status: { in: ["SENT", "PARTIAL"] },
      dueDate: { lt: now },
    },
    data: { status: "OVERDUE" },
  });
}

async function logLowStockAlert() {
  const result = await prisma.$queryRaw<Array<{ code: string; name: string; current_stock: number; minimum_stock: number }>>`
    SELECT code, name, current_stock, minimum_stock
    FROM materials
    WHERE is_active = true AND current_stock <= minimum_stock
    ORDER BY code
  `;

  if (result.length > 0) {
    console.warn(`[CRON] Low stock alert: ${result.length} material(s) at or below minimum.`);
    result.forEach((m) => {
      console.warn(`  - ${m.code} "${m.name}": stock=${m.current_stock}, min=${m.minimum_stock}`);
    });
  }
}

let interval: ReturnType<typeof setInterval> | null = null;

export function startCronJobs() {
  // Run immediately on start
  markOverdueInvoices().catch(console.error);
  logLowStockAlert().catch(console.error);

  // Run every hour
  interval = setInterval(() => {
    markOverdueInvoices().catch(console.error);
    logLowStockAlert().catch(console.error);
  }, 60 * 60 * 1000);

  console.log("[CRON] Background jobs started (interval: 1h).");
}

export function stopCronJobs() {
  if (interval) {
    clearInterval(interval);
    interval = null;
  }
}
