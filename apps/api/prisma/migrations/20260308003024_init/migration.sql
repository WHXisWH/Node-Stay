-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "wallet_address" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "display_name" TEXT,
    "kyc_level" INTEGER NOT NULL DEFAULT 0,
    "kyc_proof_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "treasury_wallet" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "merchant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'JP',
    "prefecture" TEXT,
    "city" TEXT,
    "address" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "venue_id_hash" TEXT,
    "requires_kyc" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machines" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "local_serial" TEXT,
    "hardware_fingerprint_hash" TEXT,
    "owner_wallet" TEXT,
    "machine_class" TEXT NOT NULL,
    "cpu" TEXT,
    "gpu" TEXT,
    "ram_gb" INTEGER,
    "storage_gb" INTEGER,
    "spec_hash" TEXT,
    "metadata_uri" TEXT,
    "onchain_token_id" TEXT,
    "onchain_tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REGISTERED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "machines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "machine_slots" (
    "id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "slot_start" TIMESTAMP(3) NOT NULL,
    "slot_end" TIMESTAMP(3) NOT NULL,
    "slot_type" TEXT NOT NULL,
    "occupancy_status" TEXT NOT NULL DEFAULT 'FREE',
    "reference_type" TEXT,
    "reference_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "machine_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_products" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "machine_id" TEXT,
    "product_name" TEXT NOT NULL,
    "usage_type" TEXT NOT NULL,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "duration_minutes" INTEGER,
    "transferable" BOOLEAN NOT NULL DEFAULT true,
    "transfer_cutoff_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_transfer_count" INTEGER NOT NULL DEFAULT 1,
    "kyc_level_required" INTEGER NOT NULL DEFAULT 0,
    "price_jpyc" TEXT NOT NULL,
    "metadata_uri" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_rights" (
    "id" TEXT NOT NULL,
    "usage_product_id" TEXT NOT NULL,
    "machine_id" TEXT,
    "owner_user_id" TEXT,
    "onchain_token_id" TEXT,
    "onchain_tx_hash" TEXT,
    "start_at" TIMESTAMP(3),
    "end_at" TIMESTAMP(3),
    "transferable" BOOLEAN NOT NULL DEFAULT true,
    "transfer_cutoff_at" TIMESTAMP(3),
    "transfer_count" INTEGER NOT NULL DEFAULT 0,
    "max_transfer_count" INTEGER NOT NULL DEFAULT 1,
    "kyc_level_required" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "metadata_uri" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_rights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usage_listings" (
    "id" TEXT NOT NULL,
    "usage_right_id" TEXT NOT NULL,
    "seller_user_id" TEXT NOT NULL,
    "price_jpyc" TEXT NOT NULL,
    "expiry_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "buyer_user_id" TEXT,
    "sold_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usage_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "usage_right_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "venue_id" TEXT NOT NULL,
    "machine_id" TEXT,
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "checkin_method" TEXT,
    "evidence_hash" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compute_products" (
    "id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "compute_tier" TEXT NOT NULL,
    "start_window" TIMESTAMP(3) NOT NULL,
    "end_window" TIMESTAMP(3) NOT NULL,
    "max_duration_minutes" INTEGER NOT NULL,
    "preemptible" BOOLEAN NOT NULL DEFAULT true,
    "settlement_policy" TEXT NOT NULL,
    "price_jpyc" TEXT NOT NULL,
    "metadata_uri" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compute_products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compute_rights" (
    "id" TEXT NOT NULL,
    "compute_product_id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "owner_user_id" TEXT,
    "onchain_token_id" TEXT,
    "onchain_tx_hash" TEXT,
    "status" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compute_rights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compute_jobs" (
    "id" TEXT NOT NULL,
    "compute_right_id" TEXT,
    "buyer_user_id" TEXT,
    "job_id_hash" TEXT,
    "job_type" TEXT,
    "scheduler_ref" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "result_hash" TEXT,
    "interruption_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "compute_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_programs" (
    "id" TEXT NOT NULL,
    "machine_id" TEXT NOT NULL,
    "share_bps" INTEGER NOT NULL,
    "revenue_scope" TEXT NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "settlement_cycle" TEXT NOT NULL,
    "payout_token" TEXT NOT NULL DEFAULT 'JPYC',
    "metadata_uri" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ISSUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_rights" (
    "id" TEXT NOT NULL,
    "revenue_program_id" TEXT NOT NULL,
    "holder_user_id" TEXT,
    "onchain_token_id" TEXT,
    "amount_1155" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_rights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_allocations" (
    "id" TEXT NOT NULL,
    "revenue_program_id" TEXT NOT NULL,
    "allocation_period_start" TIMESTAMP(3) NOT NULL,
    "allocation_period_end" TIMESTAMP(3) NOT NULL,
    "total_amount_jpyc" TEXT NOT NULL,
    "allocation_tx_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_claims" (
    "id" TEXT NOT NULL,
    "revenue_right_id" TEXT NOT NULL,
    "allocation_id" TEXT NOT NULL,
    "claimed_amount_jpyc" TEXT NOT NULL,
    "claim_tx_hash" TEXT,
    "claimed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revenue_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "merchant_id" TEXT,
    "wallet_address" TEXT NOT NULL,
    "wallet_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "entry_type" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT,
    "from_wallet" TEXT,
    "to_wallet" TEXT,
    "amount_jpyc" TEXT NOT NULL,
    "tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "idempotency_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "venue_id" TEXT,
    "settlement_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "gross_amount_jpyc" TEXT NOT NULL,
    "venue_share_jpyc" TEXT NOT NULL,
    "platform_share_jpyc" TEXT NOT NULL,
    "revenue_share_jpyc" TEXT NOT NULL,
    "tx_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "marketplace_listings" (
    "id" TEXT NOT NULL,
    "listing_type" TEXT NOT NULL,
    "asset_id" TEXT NOT NULL,
    "seller_user_id" TEXT,
    "price_jpyc" TEXT NOT NULL,
    "expiry_at" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "buyer_user_id" TEXT,
    "sold_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketplace_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_flags" (
    "id" TEXT NOT NULL,
    "target_type" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "risk_code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "risk_flags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disputes" (
    "id" TEXT NOT NULL,
    "reference_type" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "opener_user_id" TEXT,
    "evidence_hash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),

    CONSTRAINT "disputes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_type" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "target_type" TEXT,
    "target_id" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_wallet_address_key" ON "users"("wallet_address");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "machines_machine_id_key" ON "machines"("machine_id");

-- CreateIndex
CREATE INDEX "idx_machines_venue_id" ON "machines"("venue_id");

-- CreateIndex
CREATE INDEX "idx_machines_status" ON "machines"("status");

-- CreateIndex
CREATE INDEX "idx_machine_slots_machine_time" ON "machine_slots"("machine_id", "slot_start", "slot_end");

-- CreateIndex
CREATE UNIQUE INDEX "usage_rights_onchain_token_id_key" ON "usage_rights"("onchain_token_id");

-- CreateIndex
CREATE INDEX "idx_usage_rights_owner" ON "usage_rights"("owner_user_id");

-- CreateIndex
CREATE INDEX "idx_usage_rights_status" ON "usage_rights"("status");

-- CreateIndex
CREATE INDEX "idx_usage_rights_time" ON "usage_rights"("start_at", "end_at");

-- CreateIndex
CREATE INDEX "idx_sessions_user" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "idx_sessions_machine" ON "sessions"("machine_id");

-- CreateIndex
CREATE UNIQUE INDEX "compute_rights_onchain_token_id_key" ON "compute_rights"("onchain_token_id");

-- CreateIndex
CREATE UNIQUE INDEX "compute_jobs_job_id_hash_key" ON "compute_jobs"("job_id_hash");

-- CreateIndex
CREATE UNIQUE INDEX "wallets_wallet_address_key" ON "wallets"("wallet_address");

-- CreateIndex
CREATE INDEX "idx_ledger_reference" ON "ledger_entries"("reference_type", "reference_id");

-- CreateIndex
CREATE INDEX "idx_ledger_tx_hash" ON "ledger_entries"("tx_hash");

-- CreateIndex
CREATE INDEX "idx_audit_logs_target" ON "audit_logs"("target_type", "target_id");

-- AddForeignKey
ALTER TABLE "venues" ADD CONSTRAINT "venues_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machines" ADD CONSTRAINT "machines_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "machine_slots" ADD CONSTRAINT "machine_slots_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_products" ADD CONSTRAINT "usage_products_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_rights" ADD CONSTRAINT "usage_rights_usage_product_id_fkey" FOREIGN KEY ("usage_product_id") REFERENCES "usage_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_rights" ADD CONSTRAINT "usage_rights_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_rights" ADD CONSTRAINT "usage_rights_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_listings" ADD CONSTRAINT "usage_listings_usage_right_id_fkey" FOREIGN KEY ("usage_right_id") REFERENCES "usage_rights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usage_listings" ADD CONSTRAINT "usage_listings_seller_user_id_fkey" FOREIGN KEY ("seller_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_usage_right_id_fkey" FOREIGN KEY ("usage_right_id") REFERENCES "usage_rights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compute_products" ADD CONSTRAINT "compute_products_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compute_rights" ADD CONSTRAINT "compute_rights_compute_product_id_fkey" FOREIGN KEY ("compute_product_id") REFERENCES "compute_products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compute_rights" ADD CONSTRAINT "compute_rights_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compute_rights" ADD CONSTRAINT "compute_rights_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compute_jobs" ADD CONSTRAINT "compute_jobs_compute_right_id_fkey" FOREIGN KEY ("compute_right_id") REFERENCES "compute_rights"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_programs" ADD CONSTRAINT "revenue_programs_machine_id_fkey" FOREIGN KEY ("machine_id") REFERENCES "machines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_rights" ADD CONSTRAINT "revenue_rights_revenue_program_id_fkey" FOREIGN KEY ("revenue_program_id") REFERENCES "revenue_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_rights" ADD CONSTRAINT "revenue_rights_holder_user_id_fkey" FOREIGN KEY ("holder_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_allocations" ADD CONSTRAINT "revenue_allocations_revenue_program_id_fkey" FOREIGN KEY ("revenue_program_id") REFERENCES "revenue_programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_claims" ADD CONSTRAINT "revenue_claims_revenue_right_id_fkey" FOREIGN KEY ("revenue_right_id") REFERENCES "revenue_rights"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_claims" ADD CONSTRAINT "revenue_claims_allocation_id_fkey" FOREIGN KEY ("allocation_id") REFERENCES "revenue_allocations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_venue_id_fkey" FOREIGN KEY ("venue_id") REFERENCES "venues"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disputes" ADD CONSTRAINT "disputes_opener_user_id_fkey" FOREIGN KEY ("opener_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
