-- Lot C (multi-tenant) - C1 : RentalDocument.document_number etait unique
-- sur toute la plateforme (docs/architecture/PLAN-MULTI-TENANT.md, constat 5).
-- Une agence B ne doit pas pouvoir bloquer la numerotation d'une agence A.
--
-- Verifie a la main avant d'ecrire cette migration (script scratchpad,
-- read-only) : 0 doublon (tenant_id, document_number) sur les 105 documents
-- existants. La contrainte globale precedente implique deja l'unicite
-- composite : ce changement est un assouplissement, jamais une perte de
-- donnees.

-- ---------------------------------------------------------------------------
-- 1. Pre-flight check (defensif, redondant avec la verification manuelle).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_numbers INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_numbers FROM (
    SELECT tenant_id, document_number
    FROM rental_documents
    WHERE document_number IS NOT NULL
    GROUP BY tenant_id, document_number
    HAVING COUNT(*) > 1
  ) d;

  IF dup_numbers > 0 THEN
    RAISE EXCEPTION
      'Migration stoppee : % couple(s) (tenant_id, document_number) en double dans rental_documents.',
      dup_numbers;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Remplace l'unicite globale par une unicite par agence.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "rental_documents_document_number_key";

CREATE UNIQUE INDEX "rental_documents_tenant_id_document_number_key" ON "rental_documents"("tenant_id", "document_number");
