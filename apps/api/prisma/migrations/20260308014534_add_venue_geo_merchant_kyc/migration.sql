-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "business_name" TEXT,
ADD COLUMN     "kyc_status" TEXT NOT NULL DEFAULT 'PENDING',
ALTER COLUMN "name" SET DEFAULT '';

-- AlterTable
ALTER TABLE "venues" ADD COLUMN     "amenities" TEXT[],
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "open_hours" TEXT,
ADD COLUMN     "total_seats" INTEGER NOT NULL DEFAULT 0;
