-- Move landed costs from purchase_orders to goods_received_notes
-- Landed costs are only known after goods are cleared from port

ALTER TABLE "goods_received_notes"
  ADD COLUMN IF NOT EXISTS "freight_cost_usd"  DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "clearing_cost_ghs" DECIMAL(18,4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "other_landed_ghs"  DECIMAL(18,4) NOT NULL DEFAULT 0;
