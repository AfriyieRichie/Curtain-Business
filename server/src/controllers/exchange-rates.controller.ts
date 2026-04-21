import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import * as rateService from "../services/exchange-rate.service";

// GET /exchange-rates/current
export async function getCurrent(_req: Request, res: Response) {
  const rate = await rateService.getCurrentRate();
  if (!rate) throw new AppError(404, "No exchange rate configured yet.");
  sendSuccess(res, rate);
}

// GET /exchange-rates
export async function listHistory(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

  const [rates, total] = await Promise.all([
    prisma.exchangeRate.findMany({
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: "desc" },
      include: { createdBy: { select: { id: true, name: true } } },
    }),
    prisma.exchangeRate.count(),
  ]);

  sendPaginated(res, rates, { page, limit, total });
}

// POST /exchange-rates  (ADMIN / ACCOUNTS)
export async function createRate(req: Request, res: Response) {
  const { rate } = req.body as { rate: string };
  const newRate = await rateService.updateRate(rate, req.auth!.userId);
  sendSuccess(res, newRate, "Exchange rate updated. Material costs are being recalculated.", 201);
}
