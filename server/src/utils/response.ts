import { Response } from "express";

export function sendSuccess<T>(res: Response, data: T, message?: string, statusCode = 200): void {
  res.status(statusCode).json({ success: true, data, ...(message ? { message } : {}) });
}

export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: { page: number; limit: number; total: number }
): void {
  res.status(200).json({
    success: true,
    data,
    pagination: {
      ...pagination,
      totalPages: Math.ceil(pagination.total / pagination.limit),
    },
  });
}
