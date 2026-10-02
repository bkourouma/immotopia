-- Lot C5 (spec 039) : nouvelle portee de lien securise pour le paiement d'une echeance.
-- Migration separee : ALTER TYPE ... ADD VALUE, valeur jamais utilisee dans cette migration.
-- (Une autre branche peut ajouter sa propre valeur a cette enumeration : horodatage et nom distincts.)

-- AlterEnum
ALTER TYPE "SecureLinkScope" ADD VALUE 'INSTALLMENT_PAYMENT';
