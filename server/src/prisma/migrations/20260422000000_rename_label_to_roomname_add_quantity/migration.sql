-- Rename label -> room_name on customer_windows
ALTER TABLE "customer_windows" RENAME COLUMN "label" TO "room_name";

-- Add quantity column with default 1
ALTER TABLE "customer_windows" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
