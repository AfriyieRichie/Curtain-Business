import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { AppError } from "./errorHandler";

/** Run after express-validator chains — throws AppError(422) on failure */
export function validate(req: Request, _res: Response, next: NextFunction): void {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    throw new AppError(
      422,
      "Validation failed.",
      result.array().map((e) => ({
        field: "path" in e ? (e as { path: string }).path : "unknown",
        message: e.msg as string,
      }))
    );
  }
  next();
}
