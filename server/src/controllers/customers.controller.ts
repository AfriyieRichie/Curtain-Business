import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";

// ── Customers ─────────────────────────────────────────────────────────────────

export async function listCustomers(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { search } = req.query as Record<string, string>;

  const where = search
    ? {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [customers, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: { _count: { select: { windows: true, orders: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.customer.count({ where }),
  ]);

  sendPaginated(res, customers, { page, limit, total });
}

export async function getCustomer(req: Request, res: Response) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      windows: true,
      _count: { select: { orders: true } },
    },
  });
  sendSuccess(res, customer);
}

export async function createCustomer(req: Request, res: Response) {
  const { name, email, phone, address, notes } = req.body as {
    name: string; email?: string; phone?: string; address?: string; notes?: string;
  };
  const customer = await prisma.customer.create({ data: { name, email, phone, address, notes } });
  sendSuccess(res, customer, "Customer created.", 201);
}

export async function updateCustomer(req: Request, res: Response) {
  const { name, email, phone, address, notes } = req.body as {
    name?: string; email?: string; phone?: string; address?: string; notes?: string;
  };
  const customer = await prisma.customer.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(email !== undefined && { email }),
      ...(phone !== undefined && { phone }),
      ...(address !== undefined && { address }),
      ...(notes !== undefined && { notes }),
    },
  });
  sendSuccess(res, customer, "Customer updated.");
}

export async function deleteCustomer(req: Request, res: Response) {
  await prisma.customer.delete({ where: { id: req.params.id } });
  sendSuccess(res, null, "Customer deleted.");
}

// ── Customer Windows ──────────────────────────────────────────────────────────

export async function listWindows(req: Request, res: Response) {
  const windows = await prisma.customerWindow.findMany({
    where: { customerId: req.params.id },
    orderBy: { roomName: "asc" },
  });
  sendSuccess(res, windows);
}

export async function createWindow(req: Request, res: Response) {
  const { roomName, widthCm, dropCm, quantity, notes } = req.body as {
    roomName: string; widthCm: number; dropCm: number; quantity?: number; notes?: string;
  };
  const window = await prisma.customerWindow.create({
    data: {
      customerId: req.params.id,
      roomName,
      widthCm,
      dropCm,
      quantity: quantity ?? 1,
      notes,
    },
  });
  sendSuccess(res, window, "Window added.", 201);
}

export async function updateWindow(req: Request, res: Response) {
  const { roomName, widthCm, dropCm, quantity, notes } = req.body as {
    roomName?: string; widthCm?: number; dropCm?: number; quantity?: number; notes?: string;
  };
  const window = await prisma.customerWindow.update({
    where: { id: req.params.windowId },
    data: {
      ...(roomName && { roomName }),
      ...(widthCm !== undefined && { widthCm }),
      ...(dropCm !== undefined && { dropCm }),
      ...(quantity !== undefined && { quantity }),
      ...(notes !== undefined && { notes }),
    },
  });
  sendSuccess(res, window, "Window updated.");
}

export async function deleteWindow(req: Request, res: Response) {
  await prisma.customerWindow.delete({ where: { id: req.params.windowId } });
  sendSuccess(res, null, "Window deleted.");
}
