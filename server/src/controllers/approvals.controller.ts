import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { processApproval } from "../services/approval.service";

const include = {
  requestedBy: { select: { id: true, name: true } },
  reviewedBy:  { select: { id: true, name: true } },
};

export async function listApprovals(req: Request, res: Response) {
  const page  = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const status = (req.query.status as string) || "PENDING";

  const where = status === "ALL" ? {} : { status: status as never };

  const [items, total] = await Promise.all([
    prisma.approvalRequest.findMany({
      where,
      include,
      orderBy: { requestedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.approvalRequest.count({ where }),
  ]);

  sendPaginated(res, items, { page, limit, total });
}

export async function getApproval(req: Request, res: Response) {
  const approval = await prisma.approvalRequest.findUniqueOrThrow({
    where: { id: req.params.id },
    include,
  });
  sendSuccess(res, approval);
}

export async function approveRequest(req: Request, res: Response) {
  const { note } = req.body as { note?: string };
  const result = await processApproval(req.params.id, req.auth!.userId, "APPROVED", note);
  sendSuccess(res, result, "Approved.");
}

export async function rejectRequest(req: Request, res: Response) {
  const { note } = req.body as { note?: string };
  if (!note?.trim()) {
    sendSuccess(res, null, "A reason is required when rejecting.");
    return;
  }
  const result = await processApproval(req.params.id, req.auth!.userId, "REJECTED", note);
  sendSuccess(res, result, "Rejected.");
}

export async function getPendingCount(_req: Request, res: Response) {
  const count = await prisma.approvalRequest.count({ where: { status: "PENDING" } });
  sendSuccess(res, { count });
}
