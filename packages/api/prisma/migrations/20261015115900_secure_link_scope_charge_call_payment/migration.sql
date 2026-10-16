-- Spec 042 : nouvelle portee de lien securise pour le paiement d'appels de charges.
-- Migration separee : ALTER TYPE ... ADD VALUE, valeur jamais utilisee dans cette migration.

-- AlterEnum
ALTER TYPE "SecureLinkScope" ADD VALUE 'CHARGE_CALL_PAYMENT';
