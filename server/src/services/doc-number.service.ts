import { prisma } from "../utils/prisma";

type DocPrefix = "QT" | "ORD" | "INV" | "PO" | "GRN";

export async function nextDocNumber(prefix: DocPrefix): Promise<string> {
  const year = new Date().getFullYear();
  const key = `seq.${prefix}.${year}`;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.businessSetting.findUnique({ where: { key } });

    let seq: number;
    if (existing) {
      seq = parseInt(existing.value, 10) + 1;
      await tx.businessSetting.update({ where: { key }, data: { value: seq.toString() } });
    } else {
      seq = 1;
      await tx.businessSetting.create({
        data: { key, value: "1", description: `Auto-sequence for ${prefix} ${year}` },
      });
    }

    return `${prefix}-${year}-${seq.toString().padStart(4, "0")}`;
  });
}
