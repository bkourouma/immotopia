-- Month-1 corrections from AUDIT_CODE.md (sections 4.1, 4.2, 4.4, 4.6).
--
-- NOT YET APPLIED: this migration was generated offline (no database was
-- reachable). Review it, take a backup, then run `npx prisma migrate deploy`.
--
-- What it does:
--   1. Refuses to run if the data would violate the new constraints.
--   2. Scopes Property.internal_reference and RentalPayment.idempotency_key
--      per tenant instead of globally.
--   3. Adds tenant_id to the four property child tables and backfills it from
--      the parent property.
--   4. Detaches audit_logs from users/tenants so the trail outlives them.
--   5. Widens invoices.amount_total from Decimal(10,2) to Decimal(14,2).
--
-- Deliberately NOT included: properties.price / properties.fees stay FLOAT.
-- Moving them to Decimal is correct (see AUDIT_CODE.md 4.6) but Prisma
-- serialises Decimal as a JSON string, so it changes the API contract and
-- needs a coordinated frontend change.

-- ---------------------------------------------------------------------------
-- 1. Pre-flight checks: fail early and clearly rather than mid-migration.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  dup_refs INTEGER;
  dup_keys INTEGER;
BEGIN
  SELECT COUNT(*) INTO dup_refs FROM (
    SELECT tenant_id, internal_reference
    FROM properties
    GROUP BY tenant_id, internal_reference
    HAVING COUNT(*) > 1
  ) d;

  IF dup_refs > 0 THEN
    RAISE EXCEPTION
      'Migration stoppee : % couple(s) (tenant_id, internal_reference) en double dans properties. Deduplicez avant de relancer.',
      dup_refs;
  END IF;

  SELECT COUNT(*) INTO dup_keys FROM (
    SELECT tenant_id, idempotency_key
    FROM rental_payments
    GROUP BY tenant_id, idempotency_key
    HAVING COUNT(*) > 1
  ) d;

  IF dup_keys > 0 THEN
    RAISE EXCEPTION
      'Migration stoppee : % couple(s) (tenant_id, idempotency_key) en double dans rental_payments.',
      dup_keys;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Audit log: keep actor/tenant ids without foreign keys.
-- ---------------------------------------------------------------------------
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_actor_user_id_fkey";
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_tenant_id_fkey";

-- ---------------------------------------------------------------------------
-- 3. Replace global uniques with tenant-scoped ones.
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS "properties_internal_reference_key";
DROP INDEX IF EXISTS "rental_payments_idempotency_key_key";

-- ---------------------------------------------------------------------------
-- 4. Money precision.
-- ---------------------------------------------------------------------------
ALTER TABLE "invoices" ALTER COLUMN "amount_total" SET DATA TYPE DECIMAL(14,2);

-- price / fees keep their FLOAT type (see header note).
ALTER TABLE "properties" ALTER COLUMN "currency" SET DEFAULT 'XOF';

-- ---------------------------------------------------------------------------
-- 5. tenant_id on the property child tables, backfilled from the parent.
-- ---------------------------------------------------------------------------
ALTER TABLE "property_media" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "property_documents" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "property_status_history" ADD COLUMN "tenant_id" TEXT;
ALTER TABLE "property_visits" ADD COLUMN "tenant_id" TEXT;

UPDATE "property_media" m
SET "tenant_id" = p."tenant_id"
FROM "properties" p
WHERE m."property_id" = p."id";

UPDATE "property_documents" d
SET "tenant_id" = p."tenant_id"
FROM "properties" p
WHERE d."property_id" = p."id";

UPDATE "property_status_history" h
SET "tenant_id" = p."tenant_id"
FROM "properties" p
WHERE h."property_id" = p."id";

UPDATE "property_visits" v
SET "tenant_id" = p."tenant_id"
FROM "properties" p
WHERE v."property_id" = p."id";

-- The columns stay nullable because properties.tenant_id is itself nullable
-- today. Making both NOT NULL requires deciding what to do with orphan
-- properties first (see AUDIT_CODE.md 4.1) and is left to a follow-up.

-- ---------------------------------------------------------------------------
-- 6. Indexes.
-- ---------------------------------------------------------------------------
CREATE INDEX "audit_logs_tenant_id_created_at_idx" ON "audit_logs"("tenant_id", "created_at");
CREATE INDEX "properties_tenant_id_status_idx" ON "properties"("tenant_id", "status");
CREATE INDEX "properties_tenant_id_created_at_idx" ON "properties"("tenant_id", "created_at");
CREATE UNIQUE INDEX "properties_tenant_id_internal_reference_key" ON "properties"("tenant_id", "internal_reference");
CREATE INDEX "property_media_tenant_id_idx" ON "property_media"("tenant_id");
CREATE INDEX "property_documents_tenant_id_idx" ON "property_documents"("tenant_id");
CREATE INDEX "property_status_history_tenant_id_idx" ON "property_status_history"("tenant_id");
CREATE INDEX "property_visits_tenant_id_idx" ON "property_visits"("tenant_id");
CREATE INDEX "property_visits_tenant_id_scheduled_at_idx" ON "property_visits"("tenant_id", "scheduled_at");
CREATE UNIQUE INDEX "rental_payments_tenant_id_idempotency_key_key" ON "rental_payments"("tenant_id", "idempotency_key");

-- ---------------------------------------------------------------------------
-- 7. Foreign keys for the new tenant_id columns.
-- ---------------------------------------------------------------------------
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
