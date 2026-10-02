-- Lot B2 (spec 033) : suivi d'avancement de la regularisation fonciere.
-- Migration additive : trois types et deux tables, aucune donnee existante touchee.

-- CreateEnum
CREATE TYPE "LandTrackKey" AS ENUM ('CI_ACD', 'PERSONNALISEE');

-- CreateEnum
CREATE TYPE "LandRegularizationStatus" AS ENUM ('EN_COURS', 'TERMINEE', 'ABANDONNEE');

-- CreateEnum
CREATE TYPE "LandStepStatus" AS ENUM ('A_FAIRE', 'EN_COURS', 'TERMINEE', 'BLOQUEE');

-- CreateTable
CREATE TABLE "land_regularizations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "track" "LandTrackKey" NOT NULL,
    "status" "LandRegularizationStatus" NOT NULL DEFAULT 'EN_COURS',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_regularizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "land_regularization_steps" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "regularization_id" TEXT NOT NULL,
    "step_key" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "LandStepStatus" NOT NULL DEFAULT 'A_FAIRE',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "due_date" TIMESTAMP(3),
    "cost_xof" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "document_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "land_regularization_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "land_regularizations_tenant_id_idx" ON "land_regularizations"("tenant_id");

-- CreateIndex
CREATE INDEX "land_regularizations_property_id_idx" ON "land_regularizations"("property_id");

-- CreateIndex
CREATE INDEX "land_regularizations_tenant_id_status_idx" ON "land_regularizations"("tenant_id", "status");

-- Un seul dossier EN_COURS par bien (index unique partiel, non exprimable dans Prisma).
CREATE UNIQUE INDEX "land_regularizations_one_active_per_property_key" ON "land_regularizations"("property_id") WHERE "status" = 'EN_COURS';

-- CreateIndex
CREATE UNIQUE INDEX "land_regularization_steps_regularization_id_sort_order_key" ON "land_regularization_steps"("regularization_id", "sort_order");

-- CreateIndex
CREATE INDEX "land_regularization_steps_tenant_id_idx" ON "land_regularization_steps"("tenant_id");

-- CreateIndex
CREATE INDEX "land_regularization_steps_regularization_id_idx" ON "land_regularization_steps"("regularization_id");

-- CreateIndex
CREATE INDEX "land_regularization_steps_tenant_id_status_due_date_idx" ON "land_regularization_steps"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "land_regularization_steps_document_id_idx" ON "land_regularization_steps"("document_id");

-- AddForeignKey
ALTER TABLE "land_regularizations" ADD CONSTRAINT "land_regularizations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_regularizations" ADD CONSTRAINT "land_regularizations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_regularizations" ADD CONSTRAINT "land_regularizations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_regularization_steps" ADD CONSTRAINT "land_regularization_steps_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_regularization_steps" ADD CONSTRAINT "land_regularization_steps_regularization_id_fkey" FOREIGN KEY ("regularization_id") REFERENCES "land_regularizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "land_regularization_steps" ADD CONSTRAINT "land_regularization_steps_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "property_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
