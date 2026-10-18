-- Spec 042 §10 : signature electronique du mandat de prelevement (option).
-- Colonnes nullables uniquement, sans reecriture de table. Les valeurs
-- d'enumeration sont ajoutees par la migration precedente.

-- AlterTable
ALTER TABLE "signature_signers" ADD COLUMN     "otp_verified_at" TIMESTAMP(3),
ADD COLUMN     "view_grant_expires_at" TIMESTAMP(3),
ADD COLUMN     "view_grant_hash" CHAR(64);

-- AlterTable
ALTER TABLE "direct_debit_mandates" ADD COLUMN     "signature_request_id" UUID;
