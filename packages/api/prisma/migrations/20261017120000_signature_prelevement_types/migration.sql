-- Spec 042 §10 (signature electronique du mandat de prelevement) : valeurs
-- d'enumeration ajoutees. Migration separee : une valeur ajoutee par
-- ALTER TYPE ... ADD VALUE ne peut pas servir dans la meme transaction
-- (precedent : 20261015100000_signature_enums). Irreversible : le retour
-- arriere est un correctif en avant.

-- AlterEnum
ALTER TYPE "SignatureDocumentKind" ADD VALUE IF NOT EXISTS 'DIRECT_DEBIT_MANDATE';
ALTER TYPE "SignatureDocumentKind" ADD VALUE IF NOT EXISTS 'SYNDIC_DIRECT_DEBIT_MANDATE';
