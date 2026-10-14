-- Lot 041 (spec 041, data-model §5, migration 1) : valeurs d'enumeration
-- ajoutees par l'inventaire de chantier par WhatsApp.
-- Migration separee : une valeur ajoutee par ALTER TYPE ... ADD VALUE ne peut
-- pas servir dans la meme transaction (precedent :
-- 20261001101500_patrimoine_pack_enums). La migration
-- 20261009090200_inventaire_whatsapp_catalogue se sert de PHOTOS_INVENTAIRE.
-- Irreversible (data-model §5.3) : le retour arriere est un correctif en avant.

-- AlterEnum
ALTER TYPE "CapacityKey" ADD VALUE IF NOT EXISTS 'PHOTOS_INVENTAIRE';

-- AlterEnum
ALTER TYPE "StockAlertKind" ADD VALUE IF NOT EXISTS 'FIELD_COUNT_CLOSED';
