-- BUG-2026-10-19-001 : une programmation de montant fixe repartie PAR TYPE DE LOT
-- n'a pas de montant fixe (le total vient du bareme de la copropriete a chaque
-- emission). La contrainte d'origine exigeait fixed_amount NOT NULL pour toute
-- source FIXED : l'enregistrement echouait (500). Additif : seule la contrainte
-- de coherence est assouplie, pour ce seul mode ; aucune donnee n'est modifiee.
ALTER TABLE "syndic_charge_schedules" DROP CONSTRAINT "syndic_charge_schedules_amount_source_check";
ALTER TABLE "syndic_charge_schedules" ADD CONSTRAINT "syndic_charge_schedules_amount_source_check" CHECK (
    ("amount_source" = 'FIXED' AND "budget_id" IS NULL
      AND ("fixed_amount" IS NOT NULL OR "allocation_method" = 'BY_LOT_TYPE'))
    OR ("amount_source" = 'BUDGET' AND "fixed_amount" IS NULL)
);
