-- Spec 043 (lot S2) : mandats de gestion et de vente signables electroniquement.
-- Idempotente : relancable sans erreur. `signature_request_id` designe la
-- SignatureRequest dont le PDF scelle fait foi (sans cle etrangere, comme rental_leases).

-- AlterTable
ALTER TABLE "property_mandates" ADD COLUMN IF NOT EXISTS "signed_at" TIMESTAMP(3);
ALTER TABLE "property_mandates" ADD COLUMN IF NOT EXISTS "signature_request_id" UUID;

-- AlterTable
ALTER TABLE "sale_mandates" ADD COLUMN IF NOT EXISTS "signed_at" TIMESTAMP(3);
ALTER TABLE "sale_mandates" ADD COLUMN IF NOT EXISTS "signature_request_id" UUID;
