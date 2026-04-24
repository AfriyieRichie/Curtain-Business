-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ACCOUNTS', 'SALES', 'WORKSHOP');

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'GHS');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('MANUAL', 'AUTO');

-- CreateEnum
CREATE TYPE "UnitOfMeasure" AS ENUM ('METER', 'PIECE', 'ROLL', 'PACK', 'SET');

-- CreateEnum
CREATE TYPE "MovementType" AS ENUM ('PURCHASE', 'PRODUCTION_ISSUE', 'MANUAL_ADJUSTMENT', 'DAMAGE', 'RETURN');

-- CreateEnum
CREATE TYPE "POStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('CONFIRMED', 'IN_PRODUCTION', 'QUALITY_CHECK', 'READY', 'DELIVERED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ProductionStatus" AS ENUM ('PENDING', 'CUTTING', 'SEWING', 'COMPLETED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'MOBILE_MONEY', 'CHEQUE', 'OTHER');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'SALES',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "source" "RateSource" NOT NULL DEFAULT 'MANUAL',
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact_person" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "preferred_currency" "Currency" NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "material_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "material_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "materials" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category_id" TEXT NOT NULL,
    "unit" "UnitOfMeasure" NOT NULL DEFAULT 'METER',
    "unit_cost_usd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unit_cost_ghs" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "exchange_rate_used" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "selling_price_ghs" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "purchase_currency" "Currency" NOT NULL DEFAULT 'USD',
    "current_stock" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "minimum_stock" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "reorder_quantity" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "supplier_id" TEXT,
    "image_url" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "movement_type" "MovementType" NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit_cost_usd" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "unit_cost_ghs" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "exchange_rate_at_movement" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "reference_id" TEXT,
    "reference_type" TEXT,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "po_number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "po_currency" "Currency" NOT NULL DEFAULT 'USD',
    "status" "POStatus" NOT NULL DEFAULT 'DRAFT',
    "order_date" TIMESTAMP(3) NOT NULL,
    "expected_date" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "ordered_qty" DECIMAL(18,4) NOT NULL,
    "received_qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "unit_cost" DECIMAL(18,6) NOT NULL,
    "line_total" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_received_notes" (
    "id" TEXT NOT NULL,
    "grn_number" TEXT NOT NULL,
    "po_id" TEXT NOT NULL,
    "received_date" TIMESTAMP(3) NOT NULL,
    "exchange_rate_at_receipt" DECIMAL(18,6) NOT NULL,
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "goods_received_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goods_received_items" (
    "id" TEXT NOT NULL,
    "grn_id" TEXT NOT NULL,
    "po_item_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "received_qty" DECIMAL(18,4) NOT NULL,
    "unit_cost_usd" DECIMAL(18,6) NOT NULL,
    "unit_cost_ghs" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "goods_received_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "curtain_types" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "curtain_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_templates" (
    "id" TEXT NOT NULL,
    "curtain_type_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "default_fullness_ratio" DECIMAL(6,2) NOT NULL DEFAULT 2.5,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bom_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bom_template_items" (
    "id" TEXT NOT NULL,
    "bom_template_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "quantity_formula" TEXT NOT NULL,
    "notes" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "bom_template_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "total_spent_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_windows" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "width_cm" DECIMAL(8,2) NOT NULL,
    "drop_cm" DECIMAL(8,2) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "customer_windows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quotes" (
    "id" TEXT NOT NULL,
    "quote_number" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "valid_until" TIMESTAMP(3),
    "notes" TEXT,
    "exchange_rate_snapshot" DECIMAL(18,6) NOT NULL,
    "material_cost_usd" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "material_cost_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_amount_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "tax_amount_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "quotes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quote_items" (
    "id" TEXT NOT NULL,
    "quote_id" TEXT NOT NULL,
    "curtain_type_id" TEXT NOT NULL,
    "bom_template_id" TEXT NOT NULL,
    "window_label" TEXT NOT NULL,
    "width_cm" DECIMAL(8,2) NOT NULL,
    "drop_cm" DECIMAL(8,2) NOT NULL,
    "fullness_ratio" DECIMAL(6,2) NOT NULL,
    "fabric_material_id" TEXT NOT NULL,
    "lining_material_id" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price_ghs" DECIMAL(18,4) NOT NULL,
    "line_total_ghs" DECIMAL(18,4) NOT NULL,
    "line_cost_usd" DECIMAL(18,4) NOT NULL,
    "line_cost_ghs" DECIMAL(18,4) NOT NULL,
    "bom_snapshot" JSONB NOT NULL,
    "exchange_rate_at_quote" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "quote_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "quote_id" TEXT,
    "customer_id" TEXT NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'CONFIRMED',
    "exchange_rate_snapshot" DECIMAL(18,6) NOT NULL,
    "material_cost_usd" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "material_cost_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_amount_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tax_amount_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "deposit_amount_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balance_due_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "delivery_date" TIMESTAMP(3),
    "notes" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "curtain_type_id" TEXT NOT NULL,
    "bom_template_id" TEXT NOT NULL,
    "window_label" TEXT NOT NULL,
    "width_cm" DECIMAL(8,2) NOT NULL,
    "drop_cm" DECIMAL(8,2) NOT NULL,
    "fullness_ratio" DECIMAL(6,2) NOT NULL,
    "fabric_material_id" TEXT NOT NULL,
    "lining_material_id" TEXT,
    "description" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unit_price_ghs" DECIMAL(18,4) NOT NULL,
    "line_total_ghs" DECIMAL(18,4) NOT NULL,
    "line_cost_usd" DECIMAL(18,4) NOT NULL,
    "line_cost_ghs" DECIMAL(18,4) NOT NULL,
    "bom_snapshot" JSONB NOT NULL,
    "production_status" "ProductionStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_cards" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "job_number" TEXT NOT NULL,
    "assigned_to" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "job_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_card_materials" (
    "id" TEXT NOT NULL,
    "job_card_id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "required_qty" DECIMAL(18,4) NOT NULL,
    "issued_qty" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "is_issued" BOOLEAN NOT NULL DEFAULT false,
    "issued_at" TIMESTAMP(3),
    "issued_by" TEXT,

    CONSTRAINT "job_card_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "invoice_number" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "exchange_rate_snapshot" DECIMAL(18,6) NOT NULL,
    "material_cost_usd" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "subtotal_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "discount_amount_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tax_rate" DECIMAL(6,4) NOT NULL DEFAULT 0,
    "tax_amount_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "total_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "amount_paid_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "balance_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoice_items" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "material_id" TEXT,
    "material_code" TEXT,
    "quantity" DECIMAL(18,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unit_price_ghs" DECIMAL(18,6) NOT NULL,
    "line_total_ghs" DECIMAL(18,4) NOT NULL,
    "unit_cost_usd" DECIMAL(18,6) NOT NULL DEFAULT 0,

    CONSTRAINT "invoice_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "amount_ghs" DECIMAL(18,4) NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recorded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "business_settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "business_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "exchange_rates_effective_date_idx" ON "exchange_rates"("effective_date" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "material_categories_name_key" ON "material_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "materials_code_key" ON "materials"("code");

-- CreateIndex
CREATE INDEX "materials_code_idx" ON "materials"("code");

-- CreateIndex
CREATE INDEX "materials_category_id_idx" ON "materials"("category_id");

-- CreateIndex
CREATE INDEX "materials_is_active_idx" ON "materials"("is_active");

-- CreateIndex
CREATE INDEX "stock_movements_material_id_idx" ON "stock_movements"("material_id");

-- CreateIndex
CREATE INDEX "stock_movements_movement_type_idx" ON "stock_movements"("movement_type");

-- CreateIndex
CREATE INDEX "stock_movements_created_at_idx" ON "stock_movements"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_po_number_key" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_po_number_idx" ON "purchase_orders"("po_number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_order_items_po_id_idx" ON "purchase_order_items"("po_id");

-- CreateIndex
CREATE UNIQUE INDEX "goods_received_notes_grn_number_key" ON "goods_received_notes"("grn_number");

-- CreateIndex
CREATE INDEX "goods_received_notes_grn_number_idx" ON "goods_received_notes"("grn_number");

-- CreateIndex
CREATE INDEX "goods_received_items_grn_id_idx" ON "goods_received_items"("grn_id");

-- CreateIndex
CREATE UNIQUE INDEX "curtain_types_name_key" ON "curtain_types"("name");

-- CreateIndex
CREATE INDEX "bom_template_items_bom_template_id_sort_order_idx" ON "bom_template_items"("bom_template_id", "sort_order");

-- CreateIndex
CREATE INDEX "customer_windows_customer_id_idx" ON "customer_windows"("customer_id");

-- CreateIndex
CREATE UNIQUE INDEX "quotes_quote_number_key" ON "quotes"("quote_number");

-- CreateIndex
CREATE INDEX "quotes_quote_number_idx" ON "quotes"("quote_number");

-- CreateIndex
CREATE INDEX "quotes_status_idx" ON "quotes"("status");

-- CreateIndex
CREATE INDEX "quotes_customer_id_idx" ON "quotes"("customer_id");

-- CreateIndex
CREATE INDEX "quote_items_quote_id_idx" ON "quote_items"("quote_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_order_number_idx" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_customer_id_idx" ON "orders"("customer_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_cards_job_number_key" ON "job_cards"("job_number");

-- CreateIndex
CREATE INDEX "job_cards_order_id_idx" ON "job_cards"("order_id");

-- CreateIndex
CREATE INDEX "job_cards_status_idx" ON "job_cards"("status");

-- CreateIndex
CREATE INDEX "job_card_materials_job_card_id_idx" ON "job_card_materials"("job_card_id");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_invoice_number_idx" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_customer_id_idx" ON "invoices"("customer_id");

-- CreateIndex
CREATE INDEX "invoice_items_invoice_id_idx" ON "invoice_items"("invoice_id");

-- CreateIndex
CREATE INDEX "payments_invoice_id_idx" ON "payments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "business_settings_key_key" ON "business_settings"("key");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "material_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materials" ADD CONSTRAINT "materials_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_po_id_fkey" FOREIGN KEY ("po_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_notes" ADD CONSTRAINT "goods_received_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_items" ADD CONSTRAINT "goods_received_items_grn_id_fkey" FOREIGN KEY ("grn_id") REFERENCES "goods_received_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_items" ADD CONSTRAINT "goods_received_items_po_item_id_fkey" FOREIGN KEY ("po_item_id") REFERENCES "purchase_order_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "goods_received_items" ADD CONSTRAINT "goods_received_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_templates" ADD CONSTRAINT "bom_templates_curtain_type_id_fkey" FOREIGN KEY ("curtain_type_id") REFERENCES "curtain_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_template_items" ADD CONSTRAINT "bom_template_items_bom_template_id_fkey" FOREIGN KEY ("bom_template_id") REFERENCES "bom_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bom_template_items" ADD CONSTRAINT "bom_template_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_windows" ADD CONSTRAINT "customer_windows_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_curtain_type_id_fkey" FOREIGN KEY ("curtain_type_id") REFERENCES "curtain_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_bom_template_id_fkey" FOREIGN KEY ("bom_template_id") REFERENCES "bom_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_fabric_material_id_fkey" FOREIGN KEY ("fabric_material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quote_items" ADD CONSTRAINT "quote_items_lining_material_id_fkey" FOREIGN KEY ("lining_material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_quote_id_fkey" FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_curtain_type_id_fkey" FOREIGN KEY ("curtain_type_id") REFERENCES "curtain_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_bom_template_id_fkey" FOREIGN KEY ("bom_template_id") REFERENCES "bom_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_fabric_material_id_fkey" FOREIGN KEY ("fabric_material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_lining_material_id_fkey" FOREIGN KEY ("lining_material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_cards" ADD CONSTRAINT "job_cards_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_card_materials" ADD CONSTRAINT "job_card_materials_job_card_id_fkey" FOREIGN KEY ("job_card_id") REFERENCES "job_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_card_materials" ADD CONSTRAINT "job_card_materials_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "materials"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_fkey" FOREIGN KEY ("recorded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
