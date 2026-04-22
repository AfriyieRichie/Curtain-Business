import { prisma } from "../utils/prisma";
import { sendLowStockAlert } from "./email.service";

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
    const formatted = result.map((m) => ({
      code: m.code,
      name: m.name,
      currentStock: String(m.current_stock),
      minimumStock: String(m.minimum_stock),
    }));
    sendLowStockAlert(formatted).catch(console.error);
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
