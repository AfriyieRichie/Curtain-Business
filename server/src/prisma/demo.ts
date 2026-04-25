/**
 * Demo data loader — run with: npm run db:demo
 * Adds realistic purchase history, stock levels, customers, quotes and orders
 * on top of the base seed. Safe to re-run (uses upsert / skip-if-exists).
 */

import { PrismaClient, Prisma } from "@prisma/client";
import Decimal from "decimal.js";

const prisma = new PrismaClient();

const RATE = new Decimal("15.50");

function d(v: string | number) { return new Prisma.Decimal(v); }
function toGhs(usd: string | number) { return new Prisma.Decimal(new Decimal(usd).mul(RATE).toFixed(4)); }

async function main() {
  console.info("🏗  Loading demo data…");

  // ── Resolve required IDs ─────────────────────────────────────────────────
  const admin = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" } });
  const sales = await prisma.user.findFirstOrThrow({ where: { role: "SALES" } });

  const matMap: Record<string, string> = {};
  const mats = await prisma.material.findMany({ select: { id: true, code: true } });
  for (const m of mats) matMap[m.code] = m.id;

  const sup = await prisma.supplier.findMany({ select: { id: true, name: true } });
  const supByName = Object.fromEntries(sup.map((s) => [s.name, s.id]));
  const shantexId  = supByName["Shantex Fabrics Ltd"];
  const fabWorldId = supByName["FabWorld International"];
  const localAccId = supByName["Accra Hardware & Accessories"];

  // ── 1. RECEIVED PO — fabric shipment Jan 2026 ────────────────────────────
  const po1 = await prisma.purchaseOrder.upsert({
    where: { poNumber: "PO-2026-0001" },
    update: {},
    create: {
      poNumber: "PO-2026-0001",
      supplierId: shantexId,
      status: "RECEIVED",
      orderDate: new Date("2026-01-10"),
      expectedDate: new Date("2026-02-05"),
      freightCostUsd: d("180.00"),
      clearingCostGhs: d("620.00"),
      subtotal: d("4290.00"),
      total: d("4290.00"),
      createdById: admin.id,
      notes: "Q1 fabric restock — main fabrics",
    },
  });

  const po1Items = [
    { materialId: matMap["FAB-LIN-001"], orderedQty: d("120"), receivedQty: d("120"), unitCost: d("14.50"), lineTotal: d("1740.00") },
    { materialId: matMap["FAB-VEL-001"], orderedQty: d("80"),  receivedQty: d("80"),  unitCost: d("18.00"), lineTotal: d("1440.00") },
    { materialId: matMap["FAB-SHR-001"], orderedQty: d("100"), receivedQty: d("100"), unitCost: d("5.20"),  lineTotal: d("520.00") },
    { materialId: matMap["FAB-BLK-001"], orderedQty: d("60"),  receivedQty: d("60"),  unitCost: d("9.80"),  lineTotal: d("588.00") },
  ];

  const po1ItemRecords: { id: string; materialId: string; orderedQty: Prisma.Decimal; receivedQty: Prisma.Decimal; unitCost: Prisma.Decimal }[] = [];
  for (const item of po1Items) {
    const existing = await prisma.purchaseOrderItem.findFirst({ where: { poId: po1.id, materialId: item.materialId } });
    if (existing) {
      po1ItemRecords.push(existing);
    } else {
      const rec = await prisma.purchaseOrderItem.create({ data: { poId: po1.id, ...item } });
      po1ItemRecords.push(rec);
    }
  }

  // GRN for PO1
  const grn1 = await prisma.goodsReceivedNote.upsert({
    where: { grnNumber: "GRN-2026-0001" },
    update: {},
    create: {
      grnNumber: "GRN-2026-0001",
      poId: po1.id,
      receivedDate: new Date("2026-02-03"),
      exchangeRateAtReceipt: d("15.50"),
      createdById: admin.id,
    },
  });

  const freightGhs1 = new Decimal("180.00").mul(RATE);
  const totalLanded1 = freightGhs1.plus("620.00");
  const totalBaseUsd1 = po1Items.reduce((s, i) => s.plus(new Decimal(i.unitCost.toString()).mul(i.orderedQty.toString())), new Decimal(0));

  for (let i = 0; i < po1Items.length; i++) {
    const item = po1Items[i];
    const rec  = po1ItemRecords[i];
    const lineUsd = new Decimal(item.unitCost.toString()).mul(item.orderedQty.toString());
    const landedAlloc = totalLanded1.mul(lineUsd).div(totalBaseUsd1).div(new Decimal(item.orderedQty.toString()));
    const unitCostGhs = new Decimal(item.unitCost.toString()).mul(RATE).plus(landedAlloc);

    const exists1 = await prisma.goodsReceivedItem.findFirst({ where: { grnId: grn1.id, poItemId: rec.id } });
    if (!exists1) {
      await prisma.goodsReceivedItem.create({ data: {
        grnId: grn1.id, poItemId: rec.id, materialId: item.materialId,
        receivedQty: item.orderedQty, unitCostUsd: item.unitCost, unitCostGhs: d(unitCostGhs.toFixed(4)),
      }});
    }
  }
  console.info("  ✓ PO-2026-0001 RECEIVED (fabric shipment Jan 2026)");

  // ── 2. RECEIVED PO — accessories & tracks Feb 2026 ─────────────────────
  const po2 = await prisma.purchaseOrder.upsert({
    where: { poNumber: "PO-2026-0002" },
    update: {},
    create: {
      poNumber: "PO-2026-0002",
      supplierId: fabWorldId,
      status: "RECEIVED",
      orderDate: new Date("2026-02-01"),
      expectedDate: new Date("2026-02-20"),
      freightCostUsd: d("95.00"),
      clearingCostGhs: d("310.00"),
      subtotal: d("1437.50"),
      total: d("1437.50"),
      createdById: admin.id,
      notes: "Tracks, heading tapes, eyelets and hooks",
    },
  });

  const po2Items = [
    { materialId: matMap["TRK-ALM-001"], orderedQty: d("40"),  receivedQty: d("40"),  unitCost: d("12.00"), lineTotal: d("480.00") },
    { materialId: matMap["TRK-CRV-001"], orderedQty: d("20"),  receivedQty: d("20"),  unitCost: d("8.50"),  lineTotal: d("170.00") },
    { materialId: matMap["HT-PPL-001"],  orderedQty: d("200"), receivedQty: d("200"), unitCost: d("0.85"),  lineTotal: d("170.00") },
    { materialId: matMap["HT-PPL-002"],  orderedQty: d("200"), receivedQty: d("200"), unitCost: d("0.65"),  lineTotal: d("130.00") },
    { materialId: matMap["HT-WVE-001"],  orderedQty: d("100"), receivedQty: d("100"), unitCost: d("1.10"),  lineTotal: d("110.00") },
    { materialId: matMap["EYE-SIL-001"], orderedQty: d("500"), receivedQty: d("500"), unitCost: d("0.28"),  lineTotal: d("140.00") },
    { materialId: matMap["HKS-PPL-001"], orderedQty: d("30"),  receivedQty: d("30"),  unitCost: d("1.20"),  lineTotal: d("36.00") },
    { materialId: matMap["LIN-SAT-001"], orderedQty: d("100"), receivedQty: d("100"), unitCost: d("3.20"),  lineTotal: d("320.00") },
  ];

  const po2ItemRecords: { id: string; materialId: string; orderedQty: Prisma.Decimal; receivedQty: Prisma.Decimal; unitCost: Prisma.Decimal }[] = [];
  for (const item of po2Items) {
    const existing = await prisma.purchaseOrderItem.findFirst({ where: { poId: po2.id, materialId: item.materialId } });
    if (existing) {
      po2ItemRecords.push(existing);
    } else {
      const rec = await prisma.purchaseOrderItem.create({ data: { poId: po2.id, ...item } });
      po2ItemRecords.push(rec);
    }
  }

  const grn2 = await prisma.goodsReceivedNote.upsert({
    where: { grnNumber: "GRN-2026-0002" },
    update: {},
    create: {
      grnNumber: "GRN-2026-0002",
      poId: po2.id,
      receivedDate: new Date("2026-02-18"),
      exchangeRateAtReceipt: d("15.50"),
      createdById: admin.id,
    },
  });

  const freightGhs2 = new Decimal("95.00").mul(RATE);
  const totalLanded2 = freightGhs2.plus("310.00");
  const totalBaseUsd2 = po2Items.reduce((s, i) => s.plus(new Decimal(i.unitCost.toString()).mul(i.orderedQty.toString())), new Decimal(0));

  for (let i = 0; i < po2Items.length; i++) {
    const item = po2Items[i];
    const rec  = po2ItemRecords[i];
    const lineUsd = new Decimal(item.unitCost.toString()).mul(item.orderedQty.toString());
    const landedAlloc = totalLanded2.mul(lineUsd).div(totalBaseUsd2).div(new Decimal(item.orderedQty.toString()));
    const unitCostGhs = new Decimal(item.unitCost.toString()).mul(RATE).plus(landedAlloc);

    const exists2 = await prisma.goodsReceivedItem.findFirst({ where: { grnId: grn2.id, poItemId: rec.id } });
    if (!exists2) {
      await prisma.goodsReceivedItem.create({ data: {
        grnId: grn2.id, poItemId: rec.id, materialId: item.materialId,
        receivedQty: item.orderedQty, unitCostUsd: item.unitCost, unitCostGhs: d(unitCostGhs.toFixed(4)),
      }});
    }
  }
  console.info("  ✓ PO-2026-0002 RECEIVED (accessories & tracks Feb 2026)");

  // ── 3. RECEIVED PO — lining & blackout fabric Mar 2026 ─────────────────
  const po3 = await prisma.purchaseOrder.upsert({
    where: { poNumber: "PO-2026-0003" },
    update: {},
    create: {
      poNumber: "PO-2026-0003",
      supplierId: shantexId,
      status: "RECEIVED",
      orderDate: new Date("2026-03-01"),
      expectedDate: new Date("2026-03-25"),
      freightCostUsd: d("120.00"),
      clearingCostGhs: d("450.00"),
      subtotal: d("1300.00"),
      total: d("1300.00"),
      createdById: admin.id,
    },
  });

  const po3Items = [
    { materialId: matMap["LIN-BLK-001"], orderedQty: d("100"), receivedQty: d("100"), unitCost: d("4.80"), lineTotal: d("480.00") },
    { materialId: matMap["FAB-COT-001"], orderedQty: d("80"),  receivedQty: d("80"),  unitCost: d("7.50"), lineTotal: d("600.00") },
    { materialId: matMap["FAB-SHR-001"], orderedQty: d("50"),  receivedQty: d("50"),  unitCost: d("5.20"), lineTotal: d("260.00") },
  ];

  const po3ItemRecords: { id: string; materialId: string; orderedQty: Prisma.Decimal; receivedQty: Prisma.Decimal; unitCost: Prisma.Decimal }[] = [];
  for (const item of po3Items) {
    const existing = await prisma.purchaseOrderItem.findFirst({ where: { poId: po3.id, materialId: item.materialId } });
    if (existing) {
      po3ItemRecords.push(existing);
    } else {
      const rec = await prisma.purchaseOrderItem.create({ data: { poId: po3.id, ...item } });
      po3ItemRecords.push(rec);
    }
  }

  const grn3 = await prisma.goodsReceivedNote.upsert({
    where: { grnNumber: "GRN-2026-0003" },
    update: {},
    create: {
      grnNumber: "GRN-2026-0003",
      poId: po3.id,
      receivedDate: new Date("2026-03-22"),
      exchangeRateAtReceipt: d("15.50"),
      createdById: admin.id,
    },
  });

  const freightGhs3 = new Decimal("120.00").mul(RATE);
  const totalLanded3 = freightGhs3.plus("450.00");
  const totalBaseUsd3 = po3Items.reduce((s, i) => s.plus(new Decimal(i.unitCost.toString()).mul(i.orderedQty.toString())), new Decimal(0));

  for (let i = 0; i < po3Items.length; i++) {
    const item = po3Items[i];
    const rec  = po3ItemRecords[i];
    const lineUsd = new Decimal(item.unitCost.toString()).mul(item.orderedQty.toString());
    const landedAlloc = totalLanded3.mul(lineUsd).div(totalBaseUsd3).div(new Decimal(item.orderedQty.toString()));
    const unitCostGhs = new Decimal(item.unitCost.toString()).mul(RATE).plus(landedAlloc);

    const exists3 = await prisma.goodsReceivedItem.findFirst({ where: { grnId: grn3.id, poItemId: rec.id } });
    if (!exists3) {
      await prisma.goodsReceivedItem.create({ data: {
        grnId: grn3.id, poItemId: rec.id, materialId: item.materialId,
        receivedQty: item.orderedQty, unitCostUsd: item.unitCost, unitCostGhs: d(unitCostGhs.toFixed(4)),
      }});
    }
  }
  console.info("  ✓ PO-2026-0003 RECEIVED (lining & blackout Mar 2026)");

  // ── 4. PARTIALLY_RECEIVED PO — Apr 2026 ────────────────────────────────
  const po4 = await prisma.purchaseOrder.upsert({
    where: { poNumber: "PO-2026-0004" },
    update: {},
    create: {
      poNumber: "PO-2026-0004",
      supplierId: shantexId,
      status: "PARTIALLY_RECEIVED",
      orderDate: new Date("2026-04-01"),
      expectedDate: new Date("2026-04-20"),
      freightCostUsd: d("200.00"),
      clearingCostGhs: d("700.00"),
      subtotal: d("2900.00"),
      total: d("2900.00"),
      createdById: admin.id,
      notes: "New season luxury fabric order — partial delivery received",
    },
  });

  const po4Items = [
    { materialId: matMap["FAB-LIN-001"], orderedQty: d("150"), receivedQty: d("80"), unitCost: d("14.80"), lineTotal: d("2220.00") },
    { materialId: matMap["FAB-VEL-001"], orderedQty: d("60"),  receivedQty: d("0"),  unitCost: d("18.50"), lineTotal: d("1110.00") },
  ];

  const po4ItemRecords: { id: string; materialId: string; orderedQty: Prisma.Decimal; receivedQty: Prisma.Decimal; unitCost: Prisma.Decimal }[] = [];
  for (const item of po4Items) {
    const existing = await prisma.purchaseOrderItem.findFirst({ where: { poId: po4.id, materialId: item.materialId } });
    if (existing) {
      po4ItemRecords.push(existing);
    } else {
      const rec = await prisma.purchaseOrderItem.create({ data: { poId: po4.id, ...item } });
      po4ItemRecords.push(rec);
    }
  }

  // GRN for the partial receipt
  const grn4 = await prisma.goodsReceivedNote.upsert({
    where: { grnNumber: "GRN-2026-0004" },
    update: {},
    create: {
      grnNumber: "GRN-2026-0004",
      poId: po4.id,
      receivedDate: new Date("2026-04-15"),
      exchangeRateAtReceipt: d("15.80"),
      createdById: admin.id,
    },
  });

  // Only first item was partially received
  const po4Rec0 = po4ItemRecords[0];
  // All landed cost allocated to the received item since VEL wasn't received
  const unitCostGhs4 = new Decimal("14.80").mul("15.80").plus(
    new Decimal("200.00").mul("15.80").plus("700.00").div("80")
  );

  const exists4 = await prisma.goodsReceivedItem.findFirst({ where: { grnId: grn4.id, poItemId: po4Rec0.id } });
  if (!exists4) {
    await prisma.goodsReceivedItem.create({ data: {
      grnId: grn4.id, poItemId: po4Rec0.id, materialId: po4Items[0].materialId,
      receivedQty: d("80"), unitCostUsd: d("14.80"), unitCostGhs: d(unitCostGhs4.toFixed(4)),
    }});
  }
  console.info("  ✓ PO-2026-0004 PARTIALLY_RECEIVED (80/150 linen, velvet pending)");

  // ── 5. SENT PO — local accessories Apr 2026 ────────────────────────────
  await prisma.purchaseOrder.upsert({
    where: { poNumber: "PO-2026-0005" },
    update: {},
    create: {
      poNumber: "PO-2026-0005",
      supplierId: localAccId,
      status: "SENT",
      orderDate: new Date("2026-04-18"),
      expectedDate: new Date("2026-04-25"),
      subtotal: d("312.00"),
      total: d("312.00"),
      createdById: admin.id,
      notes: "Urgently needed — weights and fixings running low",
      items: {
        create: [
          { materialId: matMap["WGT-CHN-001"], orderedQty: d("200"), receivedQty: d("0"), unitCost: d("0.45"), lineTotal: d("90.00") },
          { materialId: matMap["FIX-SCR-001"], orderedQty: d("60"),  receivedQty: d("0"), unitCost: d("0.60"), lineTotal: d("36.00") },
        ],
      },
    },
  });
  console.info("  ✓ PO-2026-0005 SENT (awaiting local accessories delivery)");

  // ── 6. DRAFT PO — upcoming fabric order ────────────────────────────────
  await prisma.purchaseOrder.upsert({
    where: { poNumber: "PO-2026-0006" },
    update: {},
    create: {
      poNumber: "PO-2026-0006",
      supplierId: fabWorldId,
      status: "DRAFT",
      orderDate: new Date("2026-04-22"),
      freightCostUsd: d("150.00"),
      clearingCostGhs: d("500.00"),
      subtotal: d("2150.00"),
      total: d("2150.00"),
      createdById: admin.id,
      notes: "Q2 track and tape restock — pending approval",
      items: {
        create: [
          { materialId: matMap["TRK-ALM-001"], orderedQty: d("50"),  receivedQty: d("0"), unitCost: d("12.50"), lineTotal: d("625.00") },
          { materialId: matMap["HT-PPL-001"],  orderedQty: d("300"), receivedQty: d("0"), unitCost: d("0.90"),  lineTotal: d("270.00") },
          { materialId: matMap["HT-WVE-001"],  orderedQty: d("200"), receivedQty: d("0"), unitCost: d("1.15"),  lineTotal: d("230.00") },
          { materialId: matMap["EYE-SIL-001"], orderedQty: d("800"), receivedQty: d("0"), unitCost: d("0.30"),  lineTotal: d("240.00") },
        ],
      },
    },
  });
  console.info("  ✓ PO-2026-0006 DRAFT (Q2 restock pending approval)");

  // ── 7. Update material stock to realistic levels ──────────────────────
  // Reflects: initial purchase + PO history - usage in production
  const stockUpdates: Record<string, { stock: string; costUsd: string }> = {
    "FAB-LIN-001": { stock: "189.5", costUsd: "14.50" }, // 120+80 bought, ~10.5 used
    "FAB-VEL-001": { stock: "75.0",  costUsd: "18.00" }, // 80 bought, 5 used
    "FAB-SHR-001": { stock: "142.0", costUsd: "5.20"  }, // 100+50 bought, 8 used
    "FAB-BLK-001": { stock: "58.0",  costUsd: "9.80"  }, // 60 bought, 2 used
    "FAB-COT-001": { stock: "78.0",  costUsd: "7.50"  }, // 80 bought, 2 used
    "LIN-SAT-001": { stock: "89.0",  costUsd: "3.20"  }, // 100+100 bought, 21 used
    "LIN-BLK-001": { stock: "96.0",  costUsd: "4.80"  }, // 100 bought, 4 used
    "TRK-ALM-001": { stock: "38.0",  costUsd: "12.00" }, // 40 bought, 2 used
    "TRK-CRV-001": { stock: "19.0",  costUsd: "8.50"  }, // 20 bought, 1 used
    "HT-PPL-001":  { stock: "183.0", costUsd: "0.85"  }, // 200 bought, 17 used
    "HT-PPL-002":  { stock: "198.0", costUsd: "0.65"  }, // 200 bought, 2 used
    "HT-WVE-001":  { stock: "97.0",  costUsd: "1.10"  }, // 100 bought, 3 used
    "EYE-SIL-001": { stock: "460.0", costUsd: "0.28"  }, // 500 bought, 40 used
    "WGT-CHN-001": { stock: "28.0",  costUsd: "0.45"  }, // original 50, 22 used — reorder pending
    "FIX-SCR-001": { stock: "32.0",  costUsd: "0.60"  }, // original 50, 18 used
    "HKS-PPL-001": { stock: "24.0",  costUsd: "1.20"  }, // 30 bought, 6 used
  };

  const markup = new Decimal("1.35");
  for (const [code, vals] of Object.entries(stockUpdates)) {
    const matId = matMap[code];
    if (!matId) continue;
    const costGhs = new Decimal(vals.costUsd).mul(RATE);
    await prisma.material.update({
      where: { id: matId },
      data: {
        currentStock:    d(vals.stock),
        unitCostUsd:     d(vals.costUsd),
        unitCostGhs:     d(costGhs.toFixed(4)),
        sellingPriceGhs: d(costGhs.mul(markup).toFixed(4)),
        exchangeRateUsed: d("15.50"),
      },
    });
  }
  console.info("  ✓ Material stock levels updated to reflect purchase history");

  // ── 8. Additional customers ───────────────────────────────────────────
  async function findOrCreateCustomer(email: string, data: Parameters<typeof prisma.customer.create>[0]["data"]) {
    const existing = await prisma.customer.findFirst({ where: { email } });
    if (existing) return existing;
    return prisma.customer.create({ data });
  }

  const [cust4, cust5, cust6] = await Promise.all([
    findOrCreateCustomer("nana.ofori@homeplus.gh", {
      name: "Nana Ofori", phone: "+233-27-444-5555",
      email: "nana.ofori@homeplus.gh", address: "22 Airport Res. Area, Accra",
      windows: { create: [
        { roomName: "Master Bedroom", widthCm: d("200"), dropCm: d("250") },
        { roomName: "Guest Room",     widthCm: d("160"), dropCm: d("230") },
        { roomName: "Study",          widthCm: d("140"), dropCm: d("210") },
      ]},
    }),
    findOrCreateCustomer("grace.mensah@hotel.com", {
      name: "Grace Mensah (Labadi Beach Hotel)", phone: "+233-30-272-3000",
      email: "grace.mensah@hotel.com", address: "1 La Bypass, Accra",
      notes: "Corporate client — bulk orders, 15% discount applies",
      windows: { create: [
        { roomName: "Suite 101", widthCm: d("300"), dropCm: d("280") },
        { roomName: "Suite 102", widthCm: d("300"), dropCm: d("280") },
        { roomName: "Suite 103", widthCm: d("300"), dropCm: d("280") },
        { roomName: "Lobby",     widthCm: d("600"), dropCm: d("320") },
      ]},
    }),
    findOrCreateCustomer("kwabena.asare@family.com", {
      name: "Kwabena Asare", phone: "+233-24-888-9999",
      email: "kwabena.asare@family.com", address: "8 Spintex Road, Accra",
      windows: { create: [
        { roomName: "Living Room", widthCm: d("280"), dropCm: d("260") },
        { roomName: "Bedroom 1",   widthCm: d("180"), dropCm: d("240") },
        { roomName: "Bedroom 2",   widthCm: d("180"), dropCm: d("240") },
      ]},
    }),
  ]);
  console.info("  ✓ 3 additional customers created");

  // ── 9. Active quotes ──────────────────────────────────────────────────
  const ctEyelet     = await prisma.curtainType.findFirstOrThrow({ where: { name: "Eyelet" } });
  const ctPinchPleat = await prisma.curtainType.findFirstOrThrow({ where: { name: "Pinch Pleat" } });
  const ctRoman      = await prisma.curtainType.findFirstOrThrow({ where: { name: "Roman Blind" } });
  const bomEyelet    = await prisma.bOMTemplate.findFirstOrThrow({ where: { curtainTypeId: ctEyelet.id } });
  const bomPinch     = await prisma.bOMTemplate.findFirstOrThrow({ where: { curtainTypeId: ctPinchPleat.id } });
  const bomRoman     = await prisma.bOMTemplate.findFirstOrThrow({ where: { curtainTypeId: ctRoman.id } });

  // Quote for Nana Ofori — SENT, pending acceptance
  await prisma.quote.upsert({
    where: { quoteNumber: "QT-2026-0002" },
    update: {},
    create: {
      quoteNumber: "QT-2026-0002",
      customerId: cust4.id,
      status: "SENT",
      validUntil: new Date("2026-05-15"),
      exchangeRateSnapshot: d("15.50"),
      materialCostUsd: d("92.40"),
      materialCostGhs: toGhs("92.40"),
      subtotalGhs: toGhs("168.00"),
      discountAmountGhs: d("0"),
      taxRate: d("0.20"),
      taxAmountGhs: toGhs("33.60"),
      totalGhs: toGhs("201.60"),
      createdById: sales.id,
      items: {
        create: [
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Master Bedroom",
            widthCm: d("200"), dropCm: d("250"), fullnessRatio: d("2.0"),
            fabricMaterialId: matMap["FAB-LIN-001"],
            liningMaterialId: matMap["LIN-SAT-001"],
            quantity: d("1"),
            unitPriceGhs: toGhs("72.00"),
            lineTotalGhs: toGhs("72.00"),
            lineCostUsd: d("38.40"), lineCostGhs: toGhs("38.40"),
            bomSnapshot: {}, exchangeRateAtQuote: d("15.50"),
          },
          {
            curtainTypeId: ctPinchPleat.id,
            bomTemplateId: bomPinch.id,
            windowLabel: "Guest Room",
            widthCm: d("160"), dropCm: d("230"), fullnessRatio: d("2.5"),
            fabricMaterialId: matMap["FAB-VEL-001"],
            liningMaterialId: matMap["LIN-SAT-001"],
            quantity: d("1"),
            unitPriceGhs: toGhs("56.00"),
            lineTotalGhs: toGhs("56.00"),
            lineCostUsd: d("32.00"), lineCostGhs: toGhs("32.00"),
            bomSnapshot: {}, exchangeRateAtQuote: d("15.50"),
          },
          {
            curtainTypeId: ctRoman.id,
            bomTemplateId: bomRoman.id,
            windowLabel: "Study",
            widthCm: d("140"), dropCm: d("210"), fullnessRatio: d("1.0"),
            fabricMaterialId: matMap["FAB-BLK-001"],
            liningMaterialId: matMap["LIN-BLK-001"],
            quantity: d("1"),
            unitPriceGhs: toGhs("40.00"),
            lineTotalGhs: toGhs("40.00"),
            lineCostUsd: d("22.00"), lineCostGhs: toGhs("22.00"),
            bomSnapshot: {}, exchangeRateAtQuote: d("15.50"),
          },
        ],
      },
    },
  });

  // Quote for hotel — DRAFT, large order
  await prisma.quote.upsert({
    where: { quoteNumber: "QT-2026-0003" },
    update: {},
    create: {
      quoteNumber: "QT-2026-0003",
      customerId: cust5.id,
      status: "DRAFT",
      validUntil: new Date("2026-05-30"),
      exchangeRateSnapshot: d("15.50"),
      materialCostUsd: d("684.00"),
      materialCostGhs: toGhs("684.00"),
      subtotalGhs: toGhs("1200.00"),
      discountAmountGhs: toGhs("180.00"),
      taxRate: d("0.20"),
      taxAmountGhs: toGhs("204.00"),
      totalGhs: toGhs("1224.00"),
      createdById: sales.id,
      items: {
        create: [
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Suite 101",
            widthCm: d("300"), dropCm: d("280"), fullnessRatio: d("2.0"),
            fabricMaterialId: matMap["FAB-VEL-001"],
            liningMaterialId: matMap["LIN-SAT-001"],
            quantity: d("1"),
            unitPriceGhs: toGhs("220.00"),
            lineTotalGhs: toGhs("220.00"),
            lineCostUsd: d("162.00"), lineCostGhs: toGhs("162.00"),
            bomSnapshot: {}, exchangeRateAtQuote: d("15.50"),
          },
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Suite 102",
            widthCm: d("300"), dropCm: d("280"), fullnessRatio: d("2.0"),
            fabricMaterialId: matMap["FAB-VEL-001"],
            liningMaterialId: matMap["LIN-SAT-001"],
            quantity: d("1"),
            unitPriceGhs: toGhs("220.00"),
            lineTotalGhs: toGhs("220.00"),
            lineCostUsd: d("162.00"), lineCostGhs: toGhs("162.00"),
            bomSnapshot: {}, exchangeRateAtQuote: d("15.50"),
          },
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Suite 103",
            widthCm: d("300"), dropCm: d("280"), fullnessRatio: d("2.0"),
            fabricMaterialId: matMap["FAB-LIN-001"],
            liningMaterialId: matMap["LIN-SAT-001"],
            quantity: d("1"),
            unitPriceGhs: toGhs("200.00"),
            lineTotalGhs: toGhs("200.00"),
            lineCostUsd: d("180.00"), lineCostGhs: toGhs("180.00"),
            bomSnapshot: {}, exchangeRateAtQuote: d("15.50"),
          },
          {
            curtainTypeId: ctRoman.id,
            bomTemplateId: bomRoman.id,
            windowLabel: "Lobby",
            widthCm: d("600"), dropCm: d("320"), fullnessRatio: d("1.0"),
            fabricMaterialId: matMap["FAB-BLK-001"],
            liningMaterialId: matMap["LIN-BLK-001"],
            quantity: d("1"),
            unitPriceGhs: toGhs("380.00"),
            lineTotalGhs: toGhs("380.00"),
            lineCostUsd: d("180.00"), lineCostGhs: toGhs("180.00"),
            bomSnapshot: {}, exchangeRateAtQuote: d("15.50"),
          },
        ],
      },
    },
  });
  console.info("  ✓ 2 active quotes created (Nana Ofori SENT, hotel DRAFT)");

  // ── 10. Order in production ────────────────────────────────────────────
  const existingOrder = await prisma.order.findFirst({ where: { orderNumber: "ORD-2026-0002" } });
  if (!existingOrder) {
    const order2 = await prisma.order.create({
      data: {
        orderNumber: "ORD-2026-0002",
        customerId: cust6.id,
        status: "IN_PRODUCTION",
        exchangeRateSnapshot: d("15.50"),
        materialCostUsd: d("158.40"),
        materialCostGhs: toGhs("158.40"),
        subtotalGhs: toGhs("290.00"),
        discountAmountGhs: d("0"),
        taxAmountGhs: toGhs("58.00"),
        totalGhs: toGhs("348.00"),
        depositAmountGhs: toGhs("100.00"),
        balanceDueGhs: toGhs("248.00"),
        deliveryDate: new Date("2026-05-10"),
        createdById: sales.id,
        items: {
          create: [
            {
              curtainTypeId: ctEyelet.id,
              bomTemplateId: bomEyelet.id,
              windowLabel: "Living Room",
              widthCm: d("280"), dropCm: d("260"), fullnessRatio: d("2.0"),
              fabricMaterialId: matMap["FAB-LIN-001"],
              liningMaterialId: matMap["LIN-SAT-001"],
              quantity: d("1"),
              unitPriceGhs: toGhs("158.00"),
              lineTotalGhs: toGhs("158.00"),
              lineCostUsd: d("86.40"), lineCostGhs: toGhs("86.40"),
              bomSnapshot: {}, productionStatus: "CUTTING",
            },
            {
              curtainTypeId: ctRoman.id,
              bomTemplateId: bomRoman.id,
              windowLabel: "Bedroom 1",
              widthCm: d("180"), dropCm: d("240"), fullnessRatio: d("1.0"),
              fabricMaterialId: matMap["FAB-BLK-001"],
              liningMaterialId: matMap["LIN-BLK-001"],
              quantity: d("1"),
              unitPriceGhs: toGhs("72.00"),
              lineTotalGhs: toGhs("72.00"),
              lineCostUsd: d("36.00"), lineCostGhs: toGhs("36.00"),
              bomSnapshot: {}, productionStatus: "PENDING",
            },
            {
              curtainTypeId: ctRoman.id,
              bomTemplateId: bomRoman.id,
              windowLabel: "Bedroom 2",
              widthCm: d("180"), dropCm: d("240"), fullnessRatio: d("1.0"),
              fabricMaterialId: matMap["FAB-BLK-001"],
              liningMaterialId: matMap["LIN-BLK-001"],
              quantity: d("1"),
              unitPriceGhs: toGhs("60.00"),
              lineTotalGhs: toGhs("60.00"),
              lineCostUsd: d("36.00"), lineCostGhs: toGhs("36.00"),
              bomSnapshot: {}, productionStatus: "PENDING",
            },
          ],
        },
      },
    });

    // Job card for the in-production order
    await prisma.jobCard.create({
      data: {
        orderId: order2.id,
        jobNumber: "JC-2026-0001",
        status: "IN_PROGRESS",
        startedAt: new Date(),
        labourCostGhs: d("120.00"),
        machineCostGhs: d("45.00"),
        overheadCostGhs: d("30.00"),
        materials: {
          create: [
            { materialId: matMap["FAB-LIN-001"], requiredQty: d("12.2"), issuedQty: d("12.2"), isIssued: true, issuedAt: new Date() },
            { materialId: matMap["LIN-SAT-001"], requiredQty: d("12.2"), issuedQty: d("0"),   isIssued: false },
          ],
        },
      },
    });
    console.info("  ✓ ORD-2026-0002 IN_PRODUCTION with job card (Kwabena Asare)");
  } else {
    console.info("  ↩ ORD-2026-0002 already exists, skipped");
  }

  // ── 11. Overdue invoice ────────────────────────────────────────────────
  const [cust3] = await Promise.all([
    prisma.customer.findFirstOrThrow({ where: { name: "Ama Darkwah" } }),
  ]);

  const overdueSalesOrder = await prisma.order.findFirst({ where: { orderNumber: "ORD-2026-0003" } });
  if (!overdueSalesOrder) {
    const order3 = await prisma.order.create({
      data: {
        orderNumber: "ORD-2026-0003",
        customerId: cust3.id,
        status: "DELIVERED",
        exchangeRateSnapshot: d("15.50"),
        materialCostUsd: d("62.50"),
        materialCostGhs: toGhs("62.50"),
        subtotalGhs: toGhs("115.00"),
        discountAmountGhs: d("0"),
        taxAmountGhs: toGhs("23.00"),
        totalGhs: toGhs("138.00"),
        depositAmountGhs: toGhs("69.00"),
        balanceDueGhs: toGhs("69.00"),
        createdById: sales.id,
        items: {
          create: [
            {
              curtainTypeId: ctPinchPleat.id,
              bomTemplateId: bomPinch.id,
              windowLabel: "Dining Room",
              widthCm: d("250"), dropCm: d("230"), fullnessRatio: d("2.5"),
              fabricMaterialId: matMap["FAB-COT-001"],
              liningMaterialId: matMap["LIN-SAT-001"],
              quantity: d("1"),
              unitPriceGhs: toGhs("115.00"),
              lineTotalGhs: toGhs("115.00"),
              lineCostUsd: d("62.50"), lineCostGhs: toGhs("62.50"),
              bomSnapshot: {}, productionStatus: "COMPLETED",
            },
          ],
        },
      },
    });

    // Overdue invoice (due 30 days ago)
    const overdueTotal = toGhs("138.00");
    await prisma.invoice.create({
      data: {
        invoiceNumber: "INV-2026-0002",
        orderId: order3.id,
        customerId: cust3.id,
        status: "OVERDUE",
        issueDate: new Date("2026-03-01"),
        dueDate: new Date("2026-03-31"),
        exchangeRateSnapshot: d("15.50"),
        subtotalGhs: toGhs("115.00"),
        taxRate: d("0.20"),
        taxAmountGhs: toGhs("23.00"),
        totalGhs: overdueTotal,
        amountPaidGhs: toGhs("69.00"),
        balanceGhs: toGhs("69.00"),
        notes: "Balance outstanding since delivery",
        items: {
          create: [
            {
              description: "Cotton Print Floral Pinch Pleat — Dining Room",
              quantity: d("1"), unit: "SET",
              unitPriceGhs: toGhs("115.00"), lineTotalGhs: toGhs("115.00"),
              unitCostUsd: d("62.50"),
            },
          ],
        },
      },
    });
    console.info("  ✓ INV-2026-0002 OVERDUE (Ama Darkwah, GHS 1069.50 outstanding)");
  } else {
    console.info("  ↩ ORD-2026-0003 already exists, skipped");
  }

  // ── 12. Sequence counters ─────────────────────────────────────────────
  await prisma.businessSetting.upsert({ where: { key: "tax.vatRate" }, update: {}, create: { key: "tax.vatRate", value: "0.20" } });

  const seqUpdates = [
    { key: "seq.PO",  value: "6" },
    { key: "seq.GRN", value: "4" },
    { key: "seq.QT",  value: "3" },
    { key: "seq.ORD", value: "3" },
    { key: "seq.INV", value: "2" },
    { key: "seq.JC",  value: "1" },
  ];
  for (const s of seqUpdates) {
    await prisma.businessSetting.upsert({ where: { key: s.key }, update: { value: s.value }, create: s });
  }

  console.info("\n✅ Demo data loaded!\n");
  console.info("Summary:");
  console.info("  Purchase Orders : 6 (3 received, 1 partial, 1 sent, 1 draft)");
  console.info("  GRNs            : 4 (PO1, PO2, PO3 full • PO4 partial)");
  console.info("  Materials       : stock updated to reflect purchase history");
  console.info("  Customers       : 3 new (Nana Ofori, hotel, Kwabena Asare)");
  console.info("  Quotes          : 2 (1 sent to customer, 1 draft hotel quote)");
  console.info("  Orders          : 1 IN_PRODUCTION + 1 DELIVERED with overdue invoice");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
