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
    where: { id: req.params.id },
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
  const { name, description, defaultFullnessRatio } = req.body as {
    name: string; description?: string; defaultFullnessRatio?: string;
  };
  const type = await prisma.curtainType.create({
    data: {
      name,
      description,
      defaultFullnessRatio: defaultFullnessRatio ? new Decimal(defaultFullnessRatio) : new Decimal("2.5"),
    },
  });
  sendSuccess(res, type, "Curtain type created.", 201);
}

export async function updateCurtainType(req: Request, res: Response) {
  const { name, description, defaultFullnessRatio, isActive } = req.body as {
    name?: string; description?: string; defaultFullnessRatio?: string; isActive?: boolean;
  };
  const type = await prisma.curtainType.update({
    where: { id: req.params.id },
    data: {
      ...(name && { name }),
      ...(description !== undefined && { description }),
      ...(defaultFullnessRatio && { defaultFullnessRatio: new Decimal(defaultFullnessRatio) }),
      ...(isActive !== undefined && { isActive }),
    },
  });
  sendSuccess(res, type, "Curtain type updated.");
}

// ── BOM Templates ─────────────────────────────────────────────────────────────

export async function listTemplates(req: Request, res: Response) {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
  const { curtainTypeId } = req.query as Record<string, string>;

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
    where: { id: req.params.id },
    include: {
      curtainType: true,
      items: { include: { material: { select: { id: true, code: true, name: true, unit: true, unitCostUsd: true, unitCostGhs: true } } } },
    },
  });
  sendSuccess(res, template);
}

export async function createTemplate(req: Request, res: Response) {
  const { curtainTypeId, name, items } = req.body as {
    curtainTypeId: string;
    name: string;
    items: Array<{ materialId: string; formula: string; notes?: string }>;
  };

  for (const item of items) {
    const result = validateFormula(item.formula);
    if (!result.valid) {
      throw new AppError(422, `Invalid formula for item (materialId: ${item.materialId}): ${result.error}`);
    }
  }

  const template = await prisma.bOMTemplate.create({
    data: {
      curtainTypeId,
      name,
      items: {
        create: items.map((item) => ({
          materialId: item.materialId,
          formula: item.formula,
          notes: item.notes,
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
  const { name, items } = req.body as {
    name?: string;
    items?: Array<{ materialId: string; formula: string; notes?: string }>;
  };

  if (items) {
    for (const item of items) {
      const result = validateFormula(item.formula);
      if (!result.valid) {
        throw new AppError(422, `Invalid formula for item (materialId: ${item.materialId}): ${result.error}`);
      }
    }
  }

  const template = await prisma.$transaction(async (tx) => {
    if (items) {
      await tx.bOMTemplateItem.deleteMany({ where: { templateId: req.params.id } });
    }

    return tx.bOMTemplate.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(items && {
          items: {
            create: items.map((item) => ({
              materialId: item.materialId,
              formula: item.formula,
              notes: item.notes,
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
  await prisma.bOMTemplate.delete({ where: { id: req.params.id } });
  sendSuccess(res, null, "BOM template deleted.");
}

// ── BOM Calculation ───────────────────────────────────────────────────────────

export async function calculateBOMForTemplate(req: Request, res: Response) {
  const { widthCm, dropCm, fullnessRatio, fabricWidthCm } = req.body as {
    widthCm: number; dropCm: number; fullnessRatio?: number; fabricWidthCm?: number;
  };

  const template = await prisma.bOMTemplate.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      curtainType: true,
      items: { include: { material: true } },
    },
  });

  const bomItems = template.items.map((item) => ({
    materialId: item.materialId,
    formula: item.formula,
    notes: item.notes ?? undefined,
  }));

  const input = {
    widthCm,
    dropCm,
    fullnessRatio: fullnessRatio ?? Number(template.curtainType.defaultFullnessRatio),
    fabricWidthCm: fabricWidthCm ?? 280,
  };

  const result = calculateBOM(bomItems, input);

  const enriched = result.lines.map((line) => {
    const templateItem = template.items.find((i) => i.materialId === line.materialId)!;
    return {
      ...line,
      material: {
        code: templateItem.material.code,
        name: templateItem.material.name,
        unit: templateItem.material.unit,
        unitCostUsd: templateItem.material.unitCostUsd,
        unitCostGhs: templateItem.material.unitCostGhs,
      },
      lineCostUsd: new Decimal(line.quantity.toString())
        .mul(new Decimal(templateItem.material.unitCostUsd.toString()))
        .toDecimalPlaces(4)
        .toString(),
      lineCostGhs: new Decimal(line.quantity.toString())
        .mul(new Decimal(templateItem.material.unitCostGhs.toString()))
        .toDecimalPlaces(4)
        .toString(),
    };
  });

  sendSuccess(res, { input, template: { id: template.id, name: template.name }, lines: enriched });
}
