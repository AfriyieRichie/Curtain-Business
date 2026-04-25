import { Request, Response } from "express";
import Decimal from "decimal.js";
import { prisma } from "../utils/prisma";
import { sendSuccess, sendPaginated } from "../utils/response";
import { AppError } from "../middleware/errorHandler";
import { calculateBOM, validateFormula } from "../services/bom-engine";

// ── Curtain Types ─────────────────────────────────────────────────────────────

export async function listCurtainTypes(_req: Request, res: Response) {
  const types = await prisma.curtainType.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
  });
  sendSuccess(res, types);
}

export async function getCurtainType(req: Request, res: Response) {
  const type = await prisma.curtainType.findUniqueOrThrow({
    where: { id: req.params.id as string },
    include: {
      bomTemplates: {
        include: { items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  sendSuccess(res, type);
}

export async function createCurtainType(req: Request, res: Response) {
  const { name, description } = req.body as { name: string; description?: string };
  const type = await prisma.curtainType.create({ data: { name, description } });
  sendSuccess(res, type, "Curtain type created.", 201);
}

export async function updateCurtainType(req: Request, res: Response) {
  const { name, description, isActive } = req.body as {
    name?: string; description?: string; isActive?: boolean;
  };
  const type = await prisma.curtainType.update({
    where: { id: req.params.id as string },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  sendSuccess(res, type, "Curtain type updated.");
}

// ── BOM Templates ─────────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const curtainTypeId = req.query.curtainTypeId as string | undefined;

  const where = curtainTypeId ? { curtainTypeId } : {};

  const [templates, total] = await Promise.all([
    prisma.bOMTemplate.findMany({
      where,
      skip: (page - 1) * limit,
      take: limit,
      include: {
        curtainType: true,
        items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.bOMTemplate.count({ where }),
  ]);

  sendPaginated(res, templates, { page, limit, total });
}

export async function getTemplate(req: Request, res: Response) {
  const template = await prisma.bOMTemplate.findUniqueOrThrow({
    where: { id: req.params.id as string },
    include: {
      curtainType: true,
      items: { include: { material: { select: { id: true, code: true, name: true, unit: true, unitCostUsd: true, unitCostGhs: true } } } },
    },
  });
  sendSuccess(res, template);
}

export async function createTemplate(req: Request, res: Response) {
  const { curtainTypeId, name, defaultFullnessRatio, labourHours, overheadGhs, items } = req.body as {
    curtainTypeId: string;
    name: string;
    defaultFullnessRatio?: string;
    labourHours?: number;
    overheadGhs?: number;
    items: Array<{ materialId: string; quantityFormula: string; role?: string; notes?: string; sortOrder?: number }>;
  };

  for (const item of items) {
    const result = validateFormula(item.quantityFormula);
    if (!result.valid) {
      throw new AppError(422, `Invalid formula for item (materialId: ${item.materialId}): ${result.error}`);
    }
  }

  const template = await prisma.bOMTemplate.create({
    data: {
      curtainTypeId,
      name,
      defaultFullnessRatio: defaultFullnessRatio ? new Decimal(defaultFullnessRatio) : new Decimal("2.5"),
      ...(labourHours !== undefined && { labourHours: new Decimal(labourHours) }),
      ...(overheadGhs !== undefined && { overheadGhs: new Decimal(overheadGhs) }),
      items: {
        create: items.map((item, idx) => ({
          materialId: item.materialId,
          quantityFormula: item.quantityFormula,
          role: (item.role as "FIXED" | "FABRIC" | "LINING") ?? "FIXED",
          notes: item.notes,
          sortOrder: item.sortOrder ?? idx + 1,
        })),
      },
    },
    include: {
      curtainType: true,
      items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
    },
  });

  sendSuccess(res, template, "BOM template created.", 201);
}

export async function updateTemplate(req: Request, res: Response) {
  const { name, defaultFullnessRatio, labourHours, overheadGhs, items } = req.body as {
    name?: string;
    defaultFullnessRatio?: string;
    labourHours?: number;
    overheadGhs?: number;
    items?: Array<{ materialId: string; quantityFormula: string; role?: string; notes?: string; sortOrder?: number }>;
  };

  if (items) {
    for (const item of items) {
      const result = validateFormula(item.quantityFormula);
      if (!result.valid) {
        throw new AppError(422, `Invalid formula for item (materialId: ${item.materialId}): ${result.error}`);
      }
    }
  }

  const templateId = req.params.id as string;

  const template = await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.bOMTemplateItem.deleteMany({ where: { bomTemplateId: templateId } });
    }

    return tx.bOMTemplate.update({
      where: { id: templateId },
      data: {
        ...(name && { name }),
        ...(defaultFullnessRatio && { defaultFullnessRatio: new Decimal(defaultFullnessRatio) }),
        ...(labourHours !== undefined && { labourHours: new Decimal(labourHours) }),
        ...(overheadGhs !== undefined && { overheadGhs: new Decimal(overheadGhs) }),
        ...(items && {
          items: {
            create: items.map((item, idx) => ({
              materialId: item.materialId,
              quantityFormula: item.quantityFormula,
              role: (item.role as "FIXED" | "FABRIC" | "LINING") ?? "FIXED",
              notes: item.notes,
              sortOrder: item.sortOrder ?? idx + 1,
            })),
          },
        }),
      },
      include: {
        curtainType: true,
        items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
      },
    });
  });

  sendSuccess(res, template, "BOM template updated.");
}

export async function deleteTemplate(req: Request, res: Response) {
  await prisma.bOMTemplate.delete({ where: { id: req.params.id as string } });
  sendSuccess(res, null, "BOM template deleted.");
}

// ── BOM Calculation ───────────────────────────────────────────────────────────

export async function calculateBOMForTemplate(req: Request, res: Response) {
  const { widthCm, dropCm, fullnessRatio, fabricWidthCm, fabricMaterialId, liningMaterialId } = req.body as {
    widthCm: number; dropCm: number; fullnessRatio?: number; fabricWidthCm?: number;
    fabricMaterialId?: string; liningMaterialId?: string;
  };

  const template = await prisma.bOMTemplate.findUniqueOrThrow({
    where: { id: req.params.id as string },
    include: {
      curtainType: true,
      items: { include: { material: true } },
    },
  });

  // Fetch substitution materials if provided
  const [fabricMat, liningMat] = await Promise.all([
    fabricMaterialId ? prisma.material.findUnique({ where: { id: fabricMaterialId } }) : null,
    liningMaterialId ? prisma.material.findUnique({ where: { id: liningMaterialId } }) : null,
  ]);

  const bomItems = template.items.map((item) => {
    let mat = item.material;
    if (item.role === "FABRIC" && fabricMat) mat = fabricMat;
    if (item.role === "LINING" && liningMat) mat = liningMat;
    return {
      materialId: mat.id,
      materialCode: mat.code,
      description: mat.name,
      quantityFormula: item.quantityFormula,
      unit: mat.unit,
      unitCostUsd: mat.unitCostUsd,
      unitCostGhs: mat.unitCostGhs,
      _role: item.role,
    };
  });

  const input = {
    widthCm,
    dropCm,
    fullnessRatio: fullnessRatio ?? Number(template.defaultFullnessRatio),
    fabricWidthCm: fabricWidthCm ?? 280,
  };

  const result = calculateBOM(bomItems, input, 1);

  const enriched = result.lines.map((line) => {
    const bomItem = bomItems.find((i) => i.materialId === line.materialId)!;
    const templateItem = template.items.find((i) => i.materialId === line.materialId || (i.role === "FABRIC" && bomItem._role === "FABRIC") || (i.role === "LINING" && bomItem._role === "LINING"))!;
    return {
      ...line,
      role: templateItem.role,
      material: {
        code: bomItem.materialCode,
        name: bomItem.description,
        unit: bomItem.unit,
        unitCostUsd: bomItem.unitCostUsd,
        unitCostGhs: bomItem.unitCostGhs,
      },
      lineCostUsd: new Decimal(line.quantity.toString())
        .mul(new Decimal(bomItem.unitCostUsd.toString()))
        .toDecimalPlaces(4)
        .toString(),
      lineCostGhs: new Decimal(line.quantity.toString())
        .mul(new Decimal(bomItem.unitCostGhs.toString()))
        .toDecimalPlaces(4)
        .toString(),
    };
  });

  const [labourRateSetting, overheadRateSetting] = await Promise.all([
    prisma.businessSetting.findUnique({ where: { key: "production.labourRateGhs" } }),
    prisma.businessSetting.findUnique({ where: { key: "production.overheadRateGhs" } }),
  ]);
  const labourRate = new Decimal(labourRateSetting?.value ?? "0");
  const overheadRate = new Decimal(overheadRateSetting?.value ?? "0");
  const labourHours = new Decimal(template.labourHours.toString());

  const totalMatCostGhs = enriched.reduce((s, l) => s.plus(new Decimal(l.lineCostGhs)), new Decimal(0));
  const labourCostGhs = labourHours.mul(labourRate);
  // Overhead = rate-based (electricity/rent apportioned per labour hour) + any fixed template overhead
  const overheadCostGhs = labourHours.mul(overheadRate).plus(new Decimal(template.overheadGhs.toString()));

  sendSuccess(res, {
    input,
    template: { id: template.id, name: template.name, labourHours: template.labourHours, overheadGhs: template.overheadGhs },
    lines: enriched,
    totalMatCostGhs: totalMatCostGhs.toFixed(4),
    labourCostGhs: labourCostGhs.toFixed(4),
    overheadCostGhs: overheadCostGhs.toFixed(4),
  });
}
