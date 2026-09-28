-- Reglage du portail proprietaire (lot P5) : masquage de la vue patrimoine
-- et de ses rubriques (valorisation, rendement, emprunts, travaux,
-- documents). Additive uniquement, un reglage au plus par agence.

-- CreateTable
CREATE TABLE "owner_portal_settings" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "patrimony_enabled" BOOLEAN NOT NULL DEFAULT true,
    "patrimony_show_valuation" BOOLEAN NOT NULL DEFAULT true,
    "patrimony_show_yield" BOOLEAN NOT NULL DEFAULT true,
    "patrimony_show_loans" BOOLEAN NOT NULL DEFAULT true,
    "patrimony_show_works" BOOLEAN NOT NULL DEFAULT true,
    "patrimony_show_documents" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "owner_portal_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "owner_portal_settings_tenant_id_key" ON "owner_portal_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "owner_portal_settings" ADD CONSTRAINT "owner_portal_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
