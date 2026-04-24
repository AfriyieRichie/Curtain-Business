import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors?: { field: string; message: string }[]
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.errors ? { errors: err.errors } : {}),
    });
    return;
  }

  // Prisma known request errors
  if (err.constructor?.name === "PrismaClientKnownRequestError") {
    const prismaErr = err as unknown as { code: string; meta?: { target?: string[] } };
    if (prismaErr.code === "P2002") {
      const field = prismaErr.meta?.target?.[0] ?? "field";
      res.status(409).json({ success: false, message: `A record with this ${field} already exists.` });
      return;
    }
    if (prismaErr.code === "P2025") {
      res.status(404).json({ success: false, message: "Record not found." });
      return;
    }
  }

  console.error("Unhandled error:", err);

  // Surface DB connection errors clearly without leaking credentials
  if (err.message?.includes("Can't reach database") || err.message?.includes("connection") || err.constructor?.name === "PrismaClientInitializationError") {
    res.status(503).json({ success: false, message: "Database connection failed. Please try again in a moment." });
    return;
  }

  res.status(500).json({ success: false, message: "An unexpected error occurred." });
}
