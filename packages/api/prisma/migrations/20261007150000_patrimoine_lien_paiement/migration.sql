-- Lot C5 (spec 039) : lien de paiement Mobile Money d'un loyer.
-- Migration additive : une colonne nullable et un index sur online_payment_checkouts,
-- aucune donnee existante touchee. La valeur d'enum INSTALLMENT_PAYMENT de
-- "SecureLinkScope" est ajoutee par la migration suivante (20261007150100) : une valeur
-- d'enum ne peut pas etre utilisee dans la transaction qui l'ajoute.

-- AlterTable
ALTER TABLE "online_payment_checkouts" ADD COLUMN "secure_link_id" TEXT;

-- CreateIndex
CREATE INDEX "online_payment_checkouts_tenant_id_secure_link_id_idx" ON "online_payment_checkouts"("tenant_id", "secure_link_id");
