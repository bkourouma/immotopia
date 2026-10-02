-- Rattrapage de deux clés d'action oubliées par le catalogue d'audit
-- (ADR-006) : CRM_DEAL_UPDATED et CRM_DEAL_STAGE_CHANGED sont écrites par une
-- variable (`const actionKey = … ? … : …` dans crm-deal-service.ts), donc
-- absentes du premier rattrapage (20261007090000). Sans ce correctif, leurs
-- lignes historiques resteraient réservées à la plateforme et l'agence ne
-- verrait jamais les changements de ses affaires.
--
-- Le déclencheur d'immuabilité interdit tout UPDATE sur audit_logs : il est
-- suspendu le temps de cette correction de classement (colonnes `category` et
-- `visibility` seulement ; aucun fait n'est modifié), puis rétabli dans la même
-- transaction. Exception unique et documentée : toute autre modification de
-- l'historique reste refusée.

ALTER TABLE "audit_logs" DISABLE TRIGGER "audit_logs_immutable";

UPDATE "audit_logs"
SET "category" = 'DATA',
    "visibility" = CASE WHEN "tenant_id" IS NULL THEN 'PLATFORM_ONLY'::"AuditVisibility" ELSE 'TENANT'::"AuditVisibility" END
WHERE "action_key" IN ('CRM_DEAL_UPDATED', 'CRM_DEAL_STAGE_CHANGED');

ALTER TABLE "audit_logs" ENABLE TRIGGER "audit_logs_immutable";
