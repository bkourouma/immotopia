-- BUG-2026-10-19-004 : une programmation « Par tantiemes » (montant fixe) excluait les
-- parkings et lots annexes, contrairement a l'appel direct « Tous les lots ».
-- Additif : nouvelle colonne, vrai par defaut pour les NOUVELLES programmations
-- (tous les lots actifs avec tantiemes). Toute programmation existant au deploiement
-- garde le calcul historique (lots principaux seulement) : aucun montant deja
-- previsible ne change sans decision du gestionnaire.
ALTER TABLE "syndic_charge_schedules" ADD COLUMN "include_annex_lots" BOOLEAN NOT NULL DEFAULT true;
UPDATE "syndic_charge_schedules" SET "include_annex_lots" = false;
