-- Patrimoine (lot P0) : les documents d'un bien detenu passent par la
-- mecanique `PropertyDocument` (fichier prive, telechargement authentifie).
-- Ses types s'enrichissent des pieces du dossier patrimonial.
-- Ajout de valeurs seulement : aucune ligne existante n'est modifiee.

-- AlterEnum
ALTER TYPE "PropertyDocumentType" ADD VALUE IF NOT EXISTS 'NOTARIAL_DEED' BEFORE 'OTHER';
ALTER TYPE "PropertyDocumentType" ADD VALUE IF NOT EXISTS 'INSURANCE' BEFORE 'OTHER';
ALTER TYPE "PropertyDocumentType" ADD VALUE IF NOT EXISTS 'TECHNICAL_DIAGNOSIS' BEFORE 'OTHER';
ALTER TYPE "PropertyDocumentType" ADD VALUE IF NOT EXISTS 'BUILDING_PERMIT' BEFORE 'OTHER';
ALTER TYPE "PropertyDocumentType" ADD VALUE IF NOT EXISTS 'LAND_CONCESSION' BEFORE 'OTHER';
