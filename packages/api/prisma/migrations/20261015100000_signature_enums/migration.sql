-- Spec 043 (signature electronique, lot S1) : valeur d'enumeration ajoutee.
-- Migration separee : une valeur ajoutee par ALTER TYPE ... ADD VALUE ne peut
-- pas servir dans la meme transaction (precedent :
-- 20261009090000_inventaire_whatsapp_enums). Aucune ligne du catalogue ne
-- l'utilise encore : l'offre (extension ou capacite de pack) est une decision
-- tarifaire du super-admin. Irreversible : le retour arriere est un correctif
-- en avant.

-- AlterEnum
ALTER TYPE "CapacityKey" ADD VALUE IF NOT EXISTS 'SIGNATURES_MENSUELLES';
