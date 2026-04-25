ALTER TABLE "bom_templates" ADD COLUMN "labour_hours" DECIMAL(8,2) NOT NULL DEFAULT 0;
ALTER TABLE "bom_templates" ADD COLUMN "overhead_ghs"  DECIMAL(18,4) NOT NULL DEFAULT 0;
