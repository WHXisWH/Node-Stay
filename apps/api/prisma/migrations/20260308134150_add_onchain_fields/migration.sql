-- AlterTable
ALTER TABLE "compute_jobs" ADD COLUMN     "onchain_tx_hash" TEXT;

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "settlement_tx_hash" TEXT;

-- AlterTable
ALTER TABLE "usage_listings" ADD COLUMN     "onchain_listing_id" TEXT,
ADD COLUMN     "onchain_tx_hash" TEXT;
