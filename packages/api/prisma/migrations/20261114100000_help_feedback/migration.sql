-- Avis sur les fiches d'aide interne : migration additive (une table neuve, aucune donnee reprise).
-- "tenant_id" nul = avis hors agence (particulier, super-admin) ; la lecture agence filtre strictement dessus.

-- CreateTable
CREATE TABLE "help_feedback" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "user_id" TEXT NOT NULL,
    "help_id" TEXT NOT NULL,
    "useful" BOOLEAN,
    "question" TEXT,
    "path" TEXT,
    "locale" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "help_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "help_feedback_help_id_created_at_idx" ON "help_feedback"("help_id", "created_at");

-- CreateIndex
CREATE INDEX "help_feedback_tenant_id_idx" ON "help_feedback"("tenant_id");

-- CreateIndex
CREATE INDEX "help_feedback_user_id_idx" ON "help_feedback"("user_id");

-- AddForeignKey
ALTER TABLE "help_feedback" ADD CONSTRAINT "help_feedback_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "help_feedback" ADD CONSTRAINT "help_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
