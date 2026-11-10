-- Spec 048, lot Q : comptes de reception de l'agence (loyers) et des coproprietes (charges).
-- Migration additive : un enum et une table neufs, aucune donnee existante reprise.
-- Le fichier de QR (facultatif) est prive : "qr_file_url" est un identifiant de stockage
-- (/uploads/receiving-accounts/<tenant>/<fichier>), jamais renvoye par l'API.

-- CreateEnum
CREATE TYPE "ReceivingAccountScope" AS ENUM ('AGENCY', 'SYNDICATE');

-- CreateTable
CREATE TABLE "receiving_accounts" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" "ReceivingAccountScope" NOT NULL,
    "syndicate_id" UUID,
    "institution" VARCHAR(60) NOT NULL,
    "scannable_with" VARCHAR(80),
    "alias" VARCHAR(80),
    "holder_name" VARCHAR(80) NOT NULL,
    "instructions" VARCHAR(500),
    "qr_file_url" TEXT,
    "qr_mime_type" TEXT,
    "qr_sha256" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "receiving_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "receiving_accounts_tenant_id_scope_syndicate_id_idx" ON "receiving_accounts"("tenant_id", "scope", "syndicate_id");

-- AddForeignKey
ALTER TABLE "receiving_accounts" ADD CONSTRAINT "receiving_accounts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receiving_accounts" ADD CONSTRAINT "receiving_accounts_syndicate_id_fkey" FOREIGN KEY ("syndicate_id") REFERENCES "syndicates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une copropriete est exigee pour la portee SYNDICATE, interdite pour la portee AGENCY.
-- Prisma ne gere pas les contraintes CHECK : elle n'existe que dans ce SQL.
ALTER TABLE "receiving_accounts" ADD CONSTRAINT "receiving_accounts_scope_syndicate_check" CHECK (("scope" = 'AGENCY' AND "syndicate_id" IS NULL) OR ("scope" = 'SYNDICATE' AND "syndicate_id" IS NOT NULL));
