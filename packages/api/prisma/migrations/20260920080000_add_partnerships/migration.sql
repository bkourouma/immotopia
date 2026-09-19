-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "partnership_id" UUID;

-- CreateTable
CREATE TABLE "partnerships" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "partnerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_shares" (
    "id" UUID NOT NULL,
    "partnership_id" UUID NOT NULL,
    "partner_account_id" UUID NOT NULL,
    "partner_name" TEXT NOT NULL,
    "share_percent" DECIMAL(5,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partnership_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partnership_distributions" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "partnership_id" UUID NOT NULL,
    "partnership_share_id" UUID NOT NULL,
    "rental_installment_id" UUID NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'XOF',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "partnership_distributions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "partnerships_tenant_id_idx" ON "partnerships"("tenant_id");

-- CreateIndex
CREATE INDEX "partnership_shares_partnership_id_idx" ON "partnership_shares"("partnership_id");

-- CreateIndex
CREATE UNIQUE INDEX "partnership_shares_partnership_id_partner_account_id_key" ON "partnership_shares"("partnership_id", "partner_account_id");

-- CreateIndex
CREATE INDEX "partnership_distributions_tenant_id_idx" ON "partnership_distributions"("tenant_id");

-- CreateIndex
CREATE INDEX "partnership_distributions_partnership_id_period_year_period_idx" ON "partnership_distributions"("partnership_id", "period_year", "period_month");

-- CreateIndex
CREATE UNIQUE INDEX "partnership_distributions_partnership_share_id_rental_insta_key" ON "partnership_distributions"("partnership_share_id", "rental_installment_id");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnerships" ADD CONSTRAINT "partnerships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_shares" ADD CONSTRAINT "partnership_shares_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_shares" ADD CONSTRAINT "partnership_shares_partner_account_id_fkey" FOREIGN KEY ("partner_account_id") REFERENCES "third_party_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_distributions" ADD CONSTRAINT "partnership_distributions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_distributions" ADD CONSTRAINT "partnership_distributions_partnership_id_fkey" FOREIGN KEY ("partnership_id") REFERENCES "partnerships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_distributions" ADD CONSTRAINT "partnership_distributions_partnership_share_id_fkey" FOREIGN KEY ("partnership_share_id") REFERENCES "partnership_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "partnership_distributions" ADD CONSTRAINT "partnership_distributions_rental_installment_id_fkey" FOREIGN KEY ("rental_installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

