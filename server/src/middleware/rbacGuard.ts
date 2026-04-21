import { Request, Response, NextFunction } from "express";
import { AppError } from "./errorHandler";
import { AuthPayload } from "./authGuard";

type Role = AuthPayload["role"];

// Role hierarchy: ADMIN can do everything higher roles can do
const ROLE_LEVEL: Record<Role, number> = {
  WORKSHOP: 1,
  SALES: 2,
  ACCOUNTS: 3,
  ADMIN: 4,
};

export function rbacGuard(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) throw new AppError(401, "Authentication required.");
    const userLevel = ROLE_LEVEL[req.auth.role];
    const allowed = allowedRoles.some((r) => userLevel >= ROLE_LEVEL[r]);
    if (!allowed) {
      throw new AppError(403, "You do not have permission to perform this action.");
    }
    next();
  };
}
