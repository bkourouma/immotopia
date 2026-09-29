-- Reglage ImmoCopilot de la plateforme (fournisseur, modele, effort, repli).
-- Additive uniquement : une seule ligne (id 'default'), sans agence. Les cles
-- API ne sont jamais stockees ici, elles restent en variables d'environnement.

-- CreateTable
CREATE TABLE "platform_ai_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "effort" TEXT NOT NULL DEFAULT 'low',
    "refusal_fallback" BOOLEAN NOT NULL DEFAULT true,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "platform_ai_settings_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "platform_ai_settings" ADD CONSTRAINT "platform_ai_settings_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
