-- Lot B3 (spec 034) : nouvelle portee de lien securise pour l'acces des tiers de confiance.
-- Migration SEPAREE de la creation des tables : une valeur d'enum ajoutee ne doit pas etre
-- utilisee dans la transaction qui l'ajoute (elle ne l'est nulle part dans cette migration).

-- AlterEnum
ALTER TYPE "SecureLinkScope" ADD VALUE 'EXTERNAL_ACCESS_GRANT';
