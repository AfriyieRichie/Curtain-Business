-- Landed Cost Entries: allocate freight/clearing invoices across multiple GRNs

ALTER TYPE "MovementType" ADD VALUE IF NOT EXISTS 'LANDED_COST_ADJUSTMENT';

CREATE TYPE "LCEStatus" AS ENUM ('DRAFT', 'POSTED');

CREATE TABLE "landed_cost_entries" (
  "id"               TEXT          NOT NULL PRIMARY KEY,
  "lce_number"       TEXT          NOT NULL UNIQUE,
  "freight_cost_usd" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "clearing_cost_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "other_landed_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
  "exchange_rate"    DECIMAL(18,6) NOT NULL DEFAULT 1,
  "notes"            TEXT,
  "status"           "LCEStatus"   NOT NULL DEFAULT 'DRAFT',
  "posted_at"        TIMESTAMP(3),
  "created_by"       TEXT          NOT NULL,
  "created_at"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "landed_cost_grns" (
  "id"            TEXT          NOT NULL PRIMARY KEY,
  "lce_id"        TEXT          NOT NULL REFERENCES "landed_cost_entries"("id") ON DELETE CASCADE,
  "grn_id"        TEXT          NOT NULL REFERENCES "goods_received_notes"("id"),
  "allocated_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
  CONSTRAINT "landed_cost_grns_lce_id_grn_id_key" UNIQUE ("lce_id", "grn_id")
);

CREATE INDEX "landed_cost_entries_lce_number_idx" ON "landed_cost_entries"("lce_number");
CREATE INDEX "landed_cost_grns_lce_id_idx"         ON "landed_cost_grns"("lce_id");
CREATE INDEX "landed_cost_grns_grn_id_idx"         ON "landed_cost_grns"("grn_id");
