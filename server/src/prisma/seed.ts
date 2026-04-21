/**
 * Database seed — run with: npm run db:seed
 * Creates: exchange rate, suppliers, categories, 15+ materials,
 * curtain types with BOM templates, 3 customers, and a full
 * quote → order → job card → invoice → payment workflow.
 */

import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import Decimal from "decimal.js";

const prisma = new PrismaClient();

const RATE = new Decimal("15.50"); // 1 USD = 15.50 GHS

function usd(amount: string | number): Prisma.Decimal {
  return new Prisma.Decimal(amount);
}

function ghs(usdAmount: string | number): Prisma.Decimal {
  return new Prisma.Decimal(new Decimal(usdAmount).mul(RATE).toFixed(6));
}

async function main() {
  console.info("🌱 Seeding database…");

  // ── Users ────────────────────────────────────────────────────────────────
  const [admin] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@curtains.com" },
      update: {},
      create: {
        name: "Admin User",
        email: "admin@curtains.com",
        passwordHash: await bcrypt.hash("Admin@123", 12),
        role: "ADMIN",
      },
    }),
    prisma.user.upsert({
      where: { email: "sales@curtains.com" },
      update: {},
      create: {
        name: "Sales Rep",
        email: "sales@curtains.com",
        passwordHash: await bcrypt.hash("Sales@123", 12),
        role: "SALES",
      },
    }),
    prisma.user.upsert({
      where: { email: "workshop@curtains.com" },
      update: {},
      create: {
        name: "Workshop Staff",
        email: "workshop@curtains.com",
        passwordHash: await bcrypt.hash("Workshop@123", 12),
        role: "WORKSHOP",
      },
    }),
    prisma.user.upsert({
      where: { email: "accounts@curtains.com" },
      update: {},
      create: {
        name: "Accounts Manager",
        email: "accounts@curtains.com",
        passwordHash: await bcrypt.hash("Accounts@123", 12),
        role: "ACCOUNTS",
      },
    }),
  ]);

  // ── Exchange Rate ─────────────────────────────────────────────────────────
  const _exchangeRate = await prisma.exchangeRate.create({
    data: {
      rate: new Prisma.Decimal(RATE.toString()),
      effectiveDate: new Date(),
      source: "MANUAL",
      createdById: admin.id,
    },
  });
  console.info(`  ✓ Exchange rate: 1 USD = GHS ${RATE}`);

  // ── Suppliers ─────────────────────────────────────────────────────────────
  const [supplierShantex, supplierFabWorld, supplierLocalAcc] = await Promise.all([
    prisma.supplier.upsert({
      where: { id: "sup-shantex-001" },
      update: {},
      create: {
        id: "sup-shantex-001",
        name: "Shantex Fabrics Ltd",
        contactPerson: "John Chen",
        phone: "+86-21-5555-0101",
        email: "orders@shantex.com",
        address: "123 Textile Road, Shanghai, China",
        preferredCurrency: "USD",
        notes: "Main fabric supplier, 30-day payment terms",
      },
    }),
    prisma.supplier.upsert({
      where: { id: "sup-fabworld-001" },
      update: {},
      create: {
        id: "sup-fabworld-001",
        name: "FabWorld International",
        contactPerson: "Maria Santos",
        phone: "+44-20-7946-0101",
        email: "wholesale@fabworld.co.uk",
        address: "45 Commerce Lane, Manchester, UK",
        preferredCurrency: "USD",
        notes: "Specialises in heading tapes, tracks and accessories",
      },
    }),
    prisma.supplier.upsert({
      where: { id: "sup-localgh-001" },
      update: {},
      create: {
        id: "sup-localgh-001",
        name: "Accra Hardware & Accessories",
        contactPerson: "Kwame Mensah",
        phone: "+233-24-000-1234",
        email: "info@accrahardware.com.gh",
        address: "Ring Road West, Accra, Ghana",
        preferredCurrency: "GHS",
        notes: "Local supplier for fixings and small accessories",
      },
    }),
  ]);

  // ── Material Categories ───────────────────────────────────────────────────
  const cats = await Promise.all([
    "Fabric",
    "Lining",
    "Track & Rod",
    "Heading Tape",
    "Eyelets & Rings",
    "Weights & Fixings",
    "Accessories",
  ].map((name) =>
    prisma.materialCategory.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  ));

  const catMap = Object.fromEntries(cats.map((c) => [c.name, c]));
  console.info("  ✓ Material categories created");

  // ── Materials ─────────────────────────────────────────────────────────────
  const materialData = [
    // Fabrics
    { code: "FAB-LIN-001", name: "Belgian Linen Natural", catName: "Fabric", unit: "METER", costUsd: "14.50", supplier: supplierShantex.id },
    { code: "FAB-VEL-001", name: "Luxury Velvet Ivory", catName: "Fabric", unit: "METER", costUsd: "18.00", supplier: supplierShantex.id },
    { code: "FAB-SHR-001", name: "Sheer Voile White", catName: "Fabric", unit: "METER", costUsd: "5.20", supplier: supplierShantex.id },
    { code: "FAB-BLK-001", name: "Blackout Thermal Cream", catName: "Fabric", unit: "METER", costUsd: "9.80", supplier: supplierShantex.id },
    { code: "FAB-COT-001", name: "Cotton Print Floral", catName: "Fabric", unit: "METER", costUsd: "7.50", supplier: supplierFabWorld.id },
    // Linings
    { code: "LIN-SAT-001", name: "Sateen Lining White", catName: "Lining", unit: "METER", costUsd: "3.20", supplier: supplierShantex.id },
    { code: "LIN-BLK-001", name: "Blackout Lining White", catName: "Lining", unit: "METER", costUsd: "4.80", supplier: supplierShantex.id },
    // Track & Rod
    { code: "TRK-ALM-001", name: "Aluminium Track 3m", catName: "Track & Rod", unit: "PIECE", costUsd: "12.00", supplier: supplierFabWorld.id },
    { code: "TRK-CRV-001", name: "Curved Bay Track 1m", catName: "Track & Rod", unit: "PIECE", costUsd: "8.50", supplier: supplierFabWorld.id },
    // Heading Tape
    { code: "HT-PPL-001", name: "Pinch Pleat Tape 75mm", catName: "Heading Tape", unit: "METER", costUsd: "0.85", supplier: supplierFabWorld.id },
    { code: "HT-PPL-002", name: "Pencil Pleat Tape 50mm", catName: "Heading Tape", unit: "METER", costUsd: "0.65", supplier: supplierFabWorld.id },
    { code: "HT-WVE-001", name: "Wave Tape 60mm", catName: "Heading Tape", unit: "METER", costUsd: "1.10", supplier: supplierFabWorld.id },
    // Eyelets
    { code: "EYE-SIL-001", name: "Silver Eyelet Rings 40mm", catName: "Eyelets & Rings", unit: "PIECE", costUsd: "0.28", supplier: supplierFabWorld.id },
    // Weights & Fixings
    { code: "WGT-CHN-001", name: "Chain Weights per Meter", catName: "Weights & Fixings", unit: "METER", costUsd: "0.45", supplier: supplierLocalAcc.id },
    { code: "FIX-SCR-001", name: "Wall Bracket Screws (Pack/20)", catName: "Weights & Fixings", unit: "PACK", costUsd: "0.60", supplier: supplierLocalAcc.id },
    { code: "HKS-PPL-001", name: "Pinch Pleat Hooks (Pack/50)", catName: "Accessories", unit: "PACK", costUsd: "1.20", supplier: supplierFabWorld.id },
  ] as const;

  const materials: Record<string, { id: string }> = {};
  for (const m of materialData) {
    const mat = await prisma.material.upsert({
      where: { code: m.code },
      update: {},
      create: {
        code: m.code,
        name: m.name,
        categoryId: catMap[m.catName].id,
        unit: m.unit as never,
        unitCostUsd: usd(m.costUsd),
        unitCostGhs: ghs(m.costUsd),
        exchangeRateUsed: new Prisma.Decimal(RATE.toString()),
        sellingPriceGhs: new Prisma.Decimal(new Decimal(m.costUsd).mul(RATE).mul("1.35").toFixed(6)),
        purchaseCurrency: "USD",
        currentStock: usd("50"),
        minimumStock: usd("10"),
        reorderQuantity: usd("30"),
        supplierId: m.supplier,
      },
    });
    materials[m.code] = mat;
  }
  console.info(`  ✓ ${materialData.length} materials created`);

  // ── Curtain Types ─────────────────────────────────────────────────────────
  const [ctEyelet, ctPinchPleat, ctRomanBlind] = await Promise.all([
    prisma.curtainType.upsert({ where: { name: "Eyelet" }, update: {}, create: { name: "Eyelet", description: "Modern eyelet heading with metal rings" } }),
    prisma.curtainType.upsert({ where: { name: "Pinch Pleat" }, update: {}, create: { name: "Pinch Pleat", description: "Traditional triple pinch pleat heading" } }),
    prisma.curtainType.upsert({ where: { name: "Roman Blind" }, update: {}, create: { name: "Roman Blind", description: "Flat fold roman blind" } }),
  ]);

  // ── BOM Templates ─────────────────────────────────────────────────────────
  // Eyelet template
  const bomEyelet = await prisma.bOMTemplate.create({
    data: {
      curtainTypeId: ctEyelet.id,
      name: "Standard Eyelet Curtain",
      description: "Double width, lined eyelet curtain with aluminium track",
      defaultFullnessRatio: new Prisma.Decimal("2.0"),
      items: {
        create: [
          { materialId: materials["FAB-LIN-001"].id, quantityFormula: "(width_m * fullness_ratio) / fabric_width_m", notes: "Main fabric (fabric_width_m=1.4)", sortOrder: 1 },
          { materialId: materials["LIN-SAT-001"].id, quantityFormula: "(width_m * fullness_ratio) / fabric_width_m", notes: "Sateen lining same yardage", sortOrder: 2 },
          { materialId: materials["EYE-SIL-001"].id, quantityFormula: "Math.ceil(width_m * 4) + 2", notes: "Rings: 4 per metre + 2 end rings", sortOrder: 3 },
          { materialId: materials["WGT-CHN-001"].id, quantityFormula: "width_m * fullness_ratio", notes: "Chain weight at hem", sortOrder: 4 },
          { materialId: materials["TRK-ALM-001"].id, quantityFormula: "Math.ceil(width_m / 3)", notes: "3m track sections", sortOrder: 5 },
        ],
      },
    },
  });

  // Pinch Pleat template
  const _bomPinchPleat = await prisma.bOMTemplate.create({
    data: {
      curtainTypeId: ctPinchPleat.id,
      name: "Standard Pinch Pleat Curtain",
      description: "2.5× fullness, sateen lined, pinch pleat tape and hooks",
      defaultFullnessRatio: new Prisma.Decimal("2.5"),
      items: {
        create: [
          { materialId: materials["FAB-VEL-001"].id, quantityFormula: "(width_m * fullness_ratio) / fabric_width_m", sortOrder: 1 },
          { materialId: materials["LIN-SAT-001"].id, quantityFormula: "(width_m * fullness_ratio) / fabric_width_m", sortOrder: 2 },
          { materialId: materials["HT-PPL-001"].id, quantityFormula: "width_m * fullness_ratio + 0.2", notes: "Extra 20cm for joins", sortOrder: 3 },
          { materialId: materials["HKS-PPL-001"].id, quantityFormula: "Math.ceil(width_m * fullness_ratio * 3 / 50)", notes: "1 pack per 50 hooks needed (3 hooks/pleat group)", sortOrder: 4 },
          { materialId: materials["WGT-CHN-001"].id, quantityFormula: "width_m * fullness_ratio", sortOrder: 5 },
        ],
      },
    },
  });

  // Roman Blind template
  const _bomRomanBlind = await prisma.bOMTemplate.create({
    data: {
      curtainTypeId: ctRomanBlind.id,
      name: "Standard Roman Blind",
      description: "Flat roman blind with blackout lining",
      defaultFullnessRatio: new Prisma.Decimal("1.0"),
      items: {
        create: [
          { materialId: materials["FAB-BLK-001"].id, quantityFormula: "(width_m + 0.1) * (drop_m + 0.3)", notes: "Width + 10cm, drop + 30cm for folds and hem", sortOrder: 1 },
          { materialId: materials["LIN-BLK-001"].id, quantityFormula: "(width_m + 0.1) * (drop_m + 0.1)", notes: "Lining slightly smaller", sortOrder: 2 },
          { materialId: materials["TRK-CRV-001"].id, quantityFormula: "Math.ceil(width_m)", notes: "1m track sections for top rail", sortOrder: 3 },
          { materialId: materials["FIX-SCR-001"].id, quantityFormula: "1", notes: "1 pack fixings per blind", sortOrder: 4 },
        ],
      },
    },
  });

  console.info("  ✓ Curtain types & BOM templates created");

  // ── Customers ─────────────────────────────────────────────────────────────
  const [customer1, _customer2, _customer3] = await Promise.all([
    prisma.customer.create({
      data: {
        name: "Akosua Boateng",
        phone: "+233-24-111-2222",
        email: "akosua@email.com",
        address: "15 Cantonments Road, Accra",
        windows: {
          create: [
            { label: "Living Room Left", widthCm: new Prisma.Decimal("220"), dropCm: new Prisma.Decimal("260") },
            { label: "Living Room Right", widthCm: new Prisma.Decimal("220"), dropCm: new Prisma.Decimal("260") },
            { label: "Master Bedroom", widthCm: new Prisma.Decimal("180"), dropCm: new Prisma.Decimal("240") },
          ],
        },
      },
    }),
    prisma.customer.create({
      data: {
        name: "Kojo Asante",
        phone: "+233-26-333-4444",
        email: "kojo.asante@corp.com",
        address: "88 East Legon Avenue, Accra",
        windows: {
          create: [
            { label: "Office Front", widthCm: new Prisma.Decimal("300"), dropCm: new Prisma.Decimal("280") },
            { label: "Conference Room", widthCm: new Prisma.Decimal("400"), dropCm: new Prisma.Decimal("280") },
          ],
        },
      },
    }),
    prisma.customer.create({
      data: {
        name: "Ama Darkwah",
        phone: "+233-20-555-6666",
        email: "ama.d@home.com",
        address: "7 Labone Close, Accra",
        windows: {
          create: [
            { label: "Dining Room", widthCm: new Prisma.Decimal("250"), dropCm: new Prisma.Decimal("230") },
          ],
        },
      },
    }),
  ]);
  console.info("  ✓ Customers created");

  // ── Full Workflow: Quote → Order → Job Card → Invoice → Payment ──────────
  const salesUser = await prisma.user.findUniqueOrThrow({ where: { email: "sales@curtains.com" } });

  // Quote
  const quote = await prisma.quote.create({
    data: {
      quoteNumber: "QT-2024-0001",
      customerId: customer1.id,
      status: "ACCEPTED",
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      exchangeRateSnapshot: new Prisma.Decimal(RATE.toString()),
      materialCostUsd: usd("87.50"),
      materialCostGhs: ghs("87.50"),
      subtotalGhs: ghs("120.00"),
      discountAmountGhs: usd("0"),
      taxRate: new Prisma.Decimal("0"),
      taxAmountGhs: usd("0"),
      totalGhs: new Prisma.Decimal(new Decimal("120.00").mul(RATE).toFixed(4)),
      createdById: salesUser.id,
      items: {
        create: [
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Living Room Left",
            widthCm: new Prisma.Decimal("220"),
            dropCm: new Prisma.Decimal("260"),
            fullnessRatio: new Prisma.Decimal("2.0"),
            fabricMaterialId: materials["FAB-LIN-001"].id,
            liningMaterialId: materials["LIN-SAT-001"].id,
            quantity: new Prisma.Decimal("1"),
            unitPriceGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineTotalGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineCostUsd: usd("43.75"),
            lineCostGhs: ghs("43.75"),
            bomSnapshot: {},
            exchangeRateAtQuote: new Prisma.Decimal(RATE.toString()),
          },
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Living Room Right",
            widthCm: new Prisma.Decimal("220"),
            dropCm: new Prisma.Decimal("260"),
            fullnessRatio: new Prisma.Decimal("2.0"),
            fabricMaterialId: materials["FAB-LIN-001"].id,
            liningMaterialId: materials["LIN-SAT-001"].id,
            quantity: new Prisma.Decimal("1"),
            unitPriceGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineTotalGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineCostUsd: usd("43.75"),
            lineCostGhs: ghs("43.75"),
            bomSnapshot: {},
            exchangeRateAtQuote: new Prisma.Decimal(RATE.toString()),
          },
        ],
      },
    },
  });

  // Order (converted from quote)
  const order = await prisma.order.create({
    data: {
      orderNumber: "ORD-2024-0001",
      quoteId: quote.id,
      customerId: customer1.id,
      status: "DELIVERED",
      exchangeRateSnapshot: new Prisma.Decimal(RATE.toString()),
      materialCostUsd: usd("87.50"),
      materialCostGhs: ghs("87.50"),
      subtotalGhs: new Prisma.Decimal(new Decimal("120").mul(RATE).toFixed(4)),
      discountAmountGhs: usd("0"),
      taxAmountGhs: usd("0"),
      totalGhs: new Prisma.Decimal(new Decimal("120").mul(RATE).toFixed(4)),
      depositAmountGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
      balanceDueGhs: new Prisma.Decimal("0"),
      deliveryDate: new Date(),
      createdById: salesUser.id,
      items: {
        create: [
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Living Room Left",
            widthCm: new Prisma.Decimal("220"),
            dropCm: new Prisma.Decimal("260"),
            fullnessRatio: new Prisma.Decimal("2.0"),
            fabricMaterialId: materials["FAB-LIN-001"].id,
            liningMaterialId: materials["LIN-SAT-001"].id,
            quantity: new Prisma.Decimal("1"),
            unitPriceGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineTotalGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineCostUsd: usd("43.75"),
            lineCostGhs: ghs("43.75"),
            bomSnapshot: {},
            productionStatus: "COMPLETED",
          },
          {
            curtainTypeId: ctEyelet.id,
            bomTemplateId: bomEyelet.id,
            windowLabel: "Living Room Right",
            widthCm: new Prisma.Decimal("220"),
            dropCm: new Prisma.Decimal("260"),
            fullnessRatio: new Prisma.Decimal("2.0"),
            fabricMaterialId: materials["FAB-LIN-001"].id,
            liningMaterialId: materials["LIN-SAT-001"].id,
            quantity: new Prisma.Decimal("1"),
            unitPriceGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineTotalGhs: new Prisma.Decimal(new Decimal("60").mul(RATE).toFixed(4)),
            lineCostUsd: usd("43.75"),
            lineCostGhs: ghs("43.75"),
            bomSnapshot: {},
            productionStatus: "COMPLETED",
          },
        ],
      },
    },
  });

  // Job Card
  const workshopUser = await prisma.user.findUniqueOrThrow({ where: { email: "workshop@curtains.com" } });
  await prisma.jobCard.create({
    data: {
      orderId: order.id,
      jobNumber: "JOB-2024-0001",
      assignedToId: workshopUser.id,
      status: "COMPLETED",
      startedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      materials: {
        create: [
          { materialId: materials["FAB-LIN-001"].id, requiredQty: usd("10.5"), issuedQty: usd("10.5"), isIssued: true, issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
          { materialId: materials["LIN-SAT-001"].id, requiredQty: usd("10.5"), issuedQty: usd("10.5"), isIssued: true, issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
          { materialId: materials["EYE-SIL-001"].id, requiredQty: usd("20"), issuedQty: usd("20"), isIssued: true, issuedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
        ],
      },
    },
  });

  // Invoice
  const totalGhs = new Decimal("120").mul(RATE);
  const invoice = await prisma.invoice.create({
    data: {
      invoiceNumber: "INV-2024-0001",
      orderId: order.id,
      customerId: customer1.id,
      status: "PAID",
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      exchangeRateSnapshot: new Prisma.Decimal(RATE.toString()),
      materialCostUsd: usd("87.50"),
      subtotalGhs: new Prisma.Decimal(totalGhs.toFixed(4)),
      discountAmountGhs: usd("0"),
      taxRate: new Prisma.Decimal("0"),
      taxAmountGhs: usd("0"),
      totalGhs: new Prisma.Decimal(totalGhs.toFixed(4)),
      amountPaidGhs: new Prisma.Decimal(totalGhs.toFixed(4)),
      balanceGhs: new Prisma.Decimal("0"),
      items: {
        create: [
          { description: "Belgian Linen Natural (Living Rm L)", materialCode: "FAB-LIN-001", quantity: usd("5.25"), unit: "METER", unitPriceGhs: new Prisma.Decimal(new Decimal("14.50").mul(RATE).mul("1.35").toFixed(4)), lineTotalGhs: new Prisma.Decimal(new Decimal("14.50").mul(RATE).mul("1.35").mul("5.25").toFixed(4)), unitCostUsd: usd("14.50") },
          { description: "Belgian Linen Natural (Living Rm R)", materialCode: "FAB-LIN-001", quantity: usd("5.25"), unit: "METER", unitPriceGhs: new Prisma.Decimal(new Decimal("14.50").mul(RATE).mul("1.35").toFixed(4)), lineTotalGhs: new Prisma.Decimal(new Decimal("14.50").mul(RATE).mul("1.35").mul("5.25").toFixed(4)), unitCostUsd: usd("14.50") },
          { description: "Sateen Lining", materialCode: "LIN-SAT-001", quantity: usd("10.5"), unit: "METER", unitPriceGhs: new Prisma.Decimal(new Decimal("3.20").mul(RATE).mul("1.35").toFixed(4)), lineTotalGhs: new Prisma.Decimal(new Decimal("3.20").mul(RATE).mul("1.35").mul("10.5").toFixed(4)), unitCostUsd: usd("3.20") },
        ],
      },
    },
  });

  // Payments
  const accountsUser = await prisma.user.findUniqueOrThrow({ where: { email: "accounts@curtains.com" } });
  await Promise.all([
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amountGhs: new Prisma.Decimal(totalGhs.mul("0.5").toFixed(4)),
        paymentMethod: "MOBILE_MONEY",
        paymentDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        reference: "MOMO-REF-001",
        notes: "50% deposit",
        recordedById: accountsUser.id,
      },
    }),
    prisma.payment.create({
      data: {
        invoiceId: invoice.id,
        amountGhs: new Prisma.Decimal(totalGhs.mul("0.5").toFixed(4)),
        paymentMethod: "BANK_TRANSFER",
        paymentDate: new Date(),
        reference: "BANK-REF-002",
        notes: "Balance on delivery",
        recordedById: accountsUser.id,
      },
    }),
  ]);

  // ── Business Settings defaults ─────────────────────────────────────────────
  const settings = [
    { key: "business.name", value: "Elite Curtains Ghana" },
    { key: "business.phone", value: "+233-24-000-0000" },
    { key: "business.email", value: "info@elitecurtains.com.gh" },
    { key: "business.address", value: "Accra, Ghana" },
    { key: "business.taxId", value: "GHA-TAX-000001" },
    { key: "business.taxRate", value: "0" },
    { key: "business.invoiceFooter", value: "Thank you for your business!" },
    { key: "invoice.showExchangeRate", value: "true" },
    { key: "invoice.prefix", value: "INV" },
    { key: "quote.prefix", value: "QT" },
    { key: "order.prefix", value: "ORD" },
    { key: "currency.markupRatio", value: "0.35" },
    { key: "exchange.autoFetch", value: "false" },
  ];

  for (const s of settings) {
    await prisma.businessSetting.upsert({
      where: { key: s.key },
      update: { value: s.value },
      create: s,
    });
  }

  console.info("  ✓ Full workflow seeded (quote → order → job card → invoice → payment)");
  console.info("  ✓ Business settings initialized");
  console.info("\n✅ Seed complete!\n");
  console.info("Login credentials:");
  console.info("  admin@curtains.com   / Admin@123    (ADMIN)");
  console.info("  sales@curtains.com   / Sales@123    (SALES)");
  console.info("  workshop@curtains.com / Workshop@123 (WORKSHOP)");
  console.info("  accounts@curtains.com / Accounts@123 (ACCOUNTS)");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
