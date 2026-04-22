import { Request, Response } from "express";
import { prisma } from "../utils/prisma";
import { sendSuccess } from "../utils/response";
import { uploadImage } from "../services/upload.service";
import path from "path";

export async function listSettings(_req: Request, res: Response) {
  const settings = await prisma.businessSetting.findMany({
    where: { key: { not: { startsWith: "seq." } } },
    orderBy: { key: "asc" },
  });
  sendSuccess(res, settings);
}

export async function getSetting(req: Request, res: Response) {
  const setting = await prisma.businessSetting.findUniqueOrThrow({
    where: { key: req.params.key },
  });
  sendSuccess(res, setting);
}

export async function upsertSetting(req: Request, res: Response) {
  const { value } = req.body as { value: string };
  const setting = await prisma.businessSetting.upsert({
    where: { key: req.params.key },
    update: { value },
    create: { key: req.params.key, value },
  });
  sendSuccess(res, setting, "Setting saved.");
}

export async function bulkUpsertSettings(req: Request, res: Response) {
  const updates = req.body as Array<{ key: string; value: string }>;
  const results = await Promise.all(
    updates.map((u) =>
      prisma.businessSetting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: { key: u.key, value: u.value },
      })
    )
  );
  sendSuccess(res, results, "Settings saved.");
}

export const uploadLogo = uploadImage.single("logo");

export async function uploadBusinessLogo(req: Request, res: Response) {
  if (!req.file) {
    const current = await prisma.businessSetting.findUnique({ where: { key: "business.logoUrl" } });
    sendSuccess(res, current);
    return;
  }

  const logoUrl = `/uploads/images/${path.basename(req.file.path)}`;
  const setting = await prisma.businessSetting.upsert({
    where: { key: "business.logoUrl" },
    update: { value: logoUrl },
    create: { key: "business.logoUrl", value: logoUrl },
  });
  sendSuccess(res, setting, "Logo uploaded.");
}
