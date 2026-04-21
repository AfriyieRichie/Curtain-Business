import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";

const JWT_SECRET = () => process.env.JWT_SECRET!;
const REFRESH_SECRET = () => process.env.REFRESH_TOKEN_SECRET!;
const ACCESS_EXPIRES = () => process.env.JWT_EXPIRES_IN ?? "15m";
const REFRESH_EXPIRES = () => process.env.REFRESH_TOKEN_EXPIRES_IN ?? "7d";
const IS_PROD = process.env.NODE_ENV === "production";

function signAccess(userId: string, role: string) {
  return jwt.sign({ userId, role }, JWT_SECRET(), { expiresIn: ACCESS_EXPIRES() } as object);
}

function signRefresh(userId: string) {
  return jwt.sign({ userId }, REFRESH_SECRET(), { expiresIn: REFRESH_EXPIRES() } as object);
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: IS_PROD ? "strict" : "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/api/auth",
  });
}

// POST /auth/login
export async function login(req: Request, res: Response) {
  const { email, password } = req.body as { email: string; password: string };

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) throw new AppError(401, "Invalid email or password.");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw new AppError(401, "Invalid email or password.");

  const accessToken = signAccess(user.id, user.role);
  const refreshToken = signRefresh(user.id);
  setRefreshCookie(res, refreshToken);

  sendSuccess(res, {
    accessToken,
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
}

// POST /auth/logout
export async function logout(_req: Request, res: Response) {
  res.clearCookie("refreshToken", { path: "/api/auth" });
  sendSuccess(res, null, "Logged out.");
}

// POST /auth/refresh
export async function refresh(req: Request, res: Response) {
  const token = req.cookies?.refreshToken as string | undefined;
  if (!token) throw new AppError(401, "No refresh token.");

  let payload: { userId: string };
  try {
    payload = jwt.verify(token, REFRESH_SECRET()) as { userId: string };
  } catch {
    throw new AppError(401, "Invalid or expired refresh token.");
  }

  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user || !user.isActive) throw new AppError(401, "User not found or inactive.");

  const accessToken = signAccess(user.id, user.role);
  const newRefresh = signRefresh(user.id);
  setRefreshCookie(res, newRefresh);

  sendSuccess(res, { accessToken });
}

// GET /auth/me
export async function me(req: Request, res: Response) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: req.auth!.userId },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });
  sendSuccess(res, user);
}

// GET /auth/users  (ADMIN only)
export async function listUsers(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      skip: (page - 1) * limit,
      take: limit,
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.user.count(),
  ]);

  sendPaginated(res, users, { page, limit, total });
}

// POST /auth/users  (ADMIN only)
export async function createUser(req: Request, res: Response) {
  const { name, email, password, role } = req.body as {
    name: string; email: string; password: string; role: string;
  };

  const hash = await bcrypt.hash(password, 12);
  const user = await prisma.user.create({
    data: { name, email: email.toLowerCase(), passwordHash: hash, role: role as never },
    select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
  });

  sendSuccess(res, user, "User created.", 201);
}

// PUT /auth/users/:id  (ADMIN only)
export async function updateUser(req: Request, res: Response) {
  const { name, email, role } = req.body as { name?: string; email?: string; role?: string };

  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(email && { email: email.toLowerCase() }),
      ...(role && { role: role as never }),
    },
    select: { id: true, name: true, email: true, role: true, isActive: true },
  });

  sendSuccess(res, user, "User updated.");
}

// PUT /auth/users/:id/deactivate  (ADMIN only)
export async function deactivateUser(req: Request, res: Response) {
  if (req.params.id === req.auth!.userId) throw new AppError(400, "Cannot deactivate yourself.");
  await prisma.user.update({ where: { id: req.params.id }, data: { isActive: false } });
  sendSuccess(res, null, "User deactivated.");
}

// PUT /auth/users/:id/reset-password  (ADMIN only)
export async function resetPassword(req: Request, res: Response) {
  const { newPassword } = req.body as { newPassword: string };
  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: req.params.id }, data: { passwordHash: hash } });
  sendSuccess(res, null, "Password reset.");
}
