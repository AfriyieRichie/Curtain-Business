-- Migrate legacy PARTIALLY_PAID to PARTIAL (runs in a separate transaction after enum values are committed)
UPDATE "invoices" SET "status" = 'PARTIAL' WHERE "status" = 'PARTIALLY_PAID';
