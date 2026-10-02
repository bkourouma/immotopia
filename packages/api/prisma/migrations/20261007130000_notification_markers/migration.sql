-- Marqueurs de notification hors du journal d'audit (ADR-006, phase 5).
--
-- Quatre « evenements » d'audit n'etaient pas des actions d'utilisateur mais des
-- marqueurs techniques : trois anti-doublon d'alertes d'echeance du patrimoine, et
-- le journal de remise des convocations de copropriete. Ils polluaient la table
-- d'audit, et une purge de retention aurait vide la fonction qui les relit.
-- Ils ont desormais leur table.

CREATE TABLE "notification_markers" (
  "id" TEXT NOT NULL,
  "tenant_id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "payload" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_markers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notification_markers_tenant_id_kind_entity_type_entity_id_idx"
  ON "notification_markers"("tenant_id", "kind", "entity_type", "entity_id");

ALTER TABLE "notification_markers"
  ADD CONSTRAINT "notification_markers_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Reprise de l'existant : seules les lignes rattachees a une agence qui existe
-- encore ont un usage (une agence supprimee n'a plus rien a dedoublonner).
INSERT INTO "notification_markers" ("id", "tenant_id", "kind", "entity_type", "entity_id", "payload", "created_at")
SELECT a."id", a."tenant_id", a."action_key", a."entity_type", a."entity_id", a."payload", a."created_at"
FROM "audit_logs" a
WHERE a."action_key" IN (
  'PATRIMOINE_LEASE_END_ALERT_SENT',
  'PATRIMOINE_LOAN_MATURITY_ALERT_SENT',
  'PATRIMOINE_WORK_UPCOMING_ALERT_SENT',
  'PATRIMOINE_INSURANCE_POLICY_ALERT_SENT',
  'PATRIMOINE_MAINTENANCE_DUE_ALERT_SENT',
  'PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT',
  'SYNDIC_MEETING_CONVOCATION_DELIVERY',
  -- Copiee seulement : l'envoi d'un rapport reste aussi un evenement d'audit.
  'PATRIMOINE_OWNER_MONTHLY_REPORT_SENT'
)
  AND a."tenant_id" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "tenants" t WHERE t."id" = a."tenant_id");

-- Retrait de la table d'audit. Le declencheur d'immuabilite refuse tout DELETE
-- sauf sous `app.audit_purge = 'on'` (local a cette transaction) : ces lignes ne
-- sont pas des evenements d'audit, leur retrait n'enleve rien a la piste.
SELECT set_config('app.audit_purge', 'on', true);

DELETE FROM "audit_logs"
WHERE "action_key" IN (
  'PATRIMOINE_LEASE_END_ALERT_SENT',
  'PATRIMOINE_LOAN_MATURITY_ALERT_SENT',
  'PATRIMOINE_WORK_UPCOMING_ALERT_SENT',
  'PATRIMOINE_INSURANCE_POLICY_ALERT_SENT',
  'PATRIMOINE_MAINTENANCE_DUE_ALERT_SENT',
  'PATRIMOINE_LAND_STEP_OVERDUE_ALERT_SENT',
  'SYNDIC_MEETING_CONVOCATION_DELIVERY'
);

SELECT set_config('app.audit_purge', 'off', true);
