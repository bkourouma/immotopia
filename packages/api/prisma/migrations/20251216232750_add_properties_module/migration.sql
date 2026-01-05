/*
  Warnings:

  - You are about to drop the column `surface` on the `properties` table. All the data in the column will be lost.
  - You are about to drop the column `type` on the `properties` table. All the data in the column will be lost.
  - You are about to alter the column `price` on the `properties` table. The data in that column could be lost. The data in that column will be cast from `Decimal(12,2)` to `DoublePrecision`.
  - The `furnishing_status` column on the `properties` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `properties` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - A unique constraint covering the columns `[internal_reference]` on the table `properties` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `address` to the `properties` table without a default value. This is not possible if the table is not empty.
  - Added the required column `description` to the `properties` table without a default value. This is not possible if the table is not empty.
  - Added the required column `internal_reference` to the `properties` table without a default value. This is not possible if the table is not empty.
  - Added the required column `ownership_type` to the `properties` table without a default value. This is not possible if the table is not empty.
  - Added the required column `property_type` to the `properties` table without a default value. This is not possible if the table is not empty.
  - Added the required column `title` to the `properties` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APPARTEMENT', 'MAISON_VILLA', 'STUDIO', 'DUPLEX_TRIPLEX', 'CHAMBRE_COLOCATION', 'BUREAU', 'BOUTIQUE_COMMERCIAL', 'ENTREPOT_INDUSTRIEL', 'TERRAIN', 'IMMEUBLE', 'PARKING_BOX', 'LOT_PROGRAMME_NEUF');

-- CreateEnum
CREATE TYPE "PropertyOwnershipType" AS ENUM ('TENANT', 'PUBLIC', 'CLIENT');

-- CreateEnum
CREATE TYPE "PropertyTransactionMode" AS ENUM ('SALE', 'RENTAL', 'SHORT_TERM');

-- CreateEnum
CREATE TYPE "PropertyFurnishingStatus" AS ENUM ('FURNISHED', 'UNFURNISHED', 'PARTIALLY_FURNISHED');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'AVAILABLE', 'RESERVED', 'UNDER_OFFER', 'RENTED', 'SOLD', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PropertyAvailability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'SOON_AVAILABLE');

-- CreateEnum
CREATE TYPE "PropertyMediaType" AS ENUM ('PHOTO', 'VIDEO', 'TOUR_360');

-- CreateEnum
CREATE TYPE "PropertyDocumentType" AS ENUM ('TITLE_DEED', 'MANDATE', 'PLAN', 'TAX_DOCUMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertyVisitType" AS ENUM ('VISIT', 'APPOINTMENT');

-- CreateEnum
CREATE TYPE "PropertyVisitStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'DONE', 'NO_SHOW', 'CANCELED');

-- DropIndex
DROP INDEX "properties_price_idx";

-- DropIndex
DROP INDEX "properties_tenant_id_status_idx";

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "surface",
DROP COLUMN "type",
ADD COLUMN     "address" TEXT NOT NULL,
ADD COLUMN     "availability" "PropertyAvailability" NOT NULL DEFAULT 'AVAILABLE',
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "container_parent_id" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'EUR',
ADD COLUMN     "description" TEXT NOT NULL,
ADD COLUMN     "fees" DOUBLE PRECISION,
ADD COLUMN     "internal_reference" TEXT NOT NULL,
ADD COLUMN     "is_published" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "owner_user_id" TEXT,
ADD COLUMN     "ownership_type" "PropertyOwnershipType" NOT NULL,
ADD COLUMN     "property_type" "PropertyType" NOT NULL,
ADD COLUMN     "published_at" TIMESTAMP(3),
ADD COLUMN     "quality_score" INTEGER,
ADD COLUMN     "quality_score_updated_at" TIMESTAMP(3),
ADD COLUMN     "surface_area" DOUBLE PRECISION,
ADD COLUMN     "surface_terrain" DOUBLE PRECISION,
ADD COLUMN     "surface_useful" DOUBLE PRECISION,
ADD COLUMN     "title" TEXT NOT NULL,
ADD COLUMN     "transaction_modes" "PropertyTransactionMode"[],
ADD COLUMN     "type_specific_data" JSONB,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1,
ALTER COLUMN "tenant_id" DROP NOT NULL,
ALTER COLUMN "price" SET DATA TYPE DOUBLE PRECISION,
DROP COLUMN "furnishing_status",
ADD COLUMN     "furnishing_status" "PropertyFurnishingStatus",
DROP COLUMN "status",
ADD COLUMN     "status" "PropertyStatus" NOT NULL DEFAULT 'DRAFT';

-- CreateTable
CREATE TABLE "property_type_templates" (
    "id" TEXT NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "field_definitions" JSONB NOT NULL,
    "sections" JSONB NOT NULL,
    "validation_rules" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_type_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_media" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "media_type" "PropertyMediaType" NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_url" TEXT,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_documents" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "document_type" "PropertyDocumentType" NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_url" TEXT,
    "file_name" TEXT NOT NULL,
    "file_size" INTEGER,
    "mime_type" TEXT,
    "expiration_date" TIMESTAMP(3),
    "warning_sent_at" TIMESTAMP(3),
    "grace_period_ends_at" TIMESTAMP(3),
    "is_required" BOOLEAN NOT NULL DEFAULT false,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_status_history" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "previous_status" "PropertyStatus",
    "new_status" "PropertyStatus" NOT NULL,
    "changed_by_user_id" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_visits" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "visit_type" "PropertyVisitType" NOT NULL DEFAULT 'VISIT',
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "duration" INTEGER,
    "location" TEXT,
    "status" "PropertyVisitStatus" NOT NULL DEFAULT 'SCHEDULED',
    "assigned_to_user_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_mandates" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "owner_user_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "scope" JSONB,
    "notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "revoked_at" TIMESTAMP(3),
    "revoked_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "property_mandates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_quality_scores" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "suggestions" JSONB NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_quality_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_type_templates_property_type_key" ON "property_type_templates"("property_type");

-- CreateIndex
CREATE INDEX "property_media_property_id_idx" ON "property_media"("property_id");

-- CreateIndex
CREATE INDEX "property_media_property_id_display_order_idx" ON "property_media"("property_id", "display_order");

-- CreateIndex
CREATE INDEX "property_media_property_id_is_primary_idx" ON "property_media"("property_id", "is_primary");

-- CreateIndex
CREATE INDEX "property_documents_property_id_idx" ON "property_documents"("property_id");

-- CreateIndex
CREATE INDEX "property_documents_expiration_date_idx" ON "property_documents"("expiration_date");

-- CreateIndex
CREATE INDEX "property_documents_property_id_document_type_idx" ON "property_documents"("property_id", "document_type");

-- CreateIndex
CREATE INDEX "property_status_history_property_id_idx" ON "property_status_history"("property_id");

-- CreateIndex
CREATE INDEX "property_status_history_property_id_created_at_idx" ON "property_status_history"("property_id", "created_at");

-- CreateIndex
CREATE INDEX "property_status_history_changed_by_user_id_idx" ON "property_status_history"("changed_by_user_id");

-- CreateIndex
CREATE INDEX "property_visits_property_id_idx" ON "property_visits"("property_id");

-- CreateIndex
CREATE INDEX "property_visits_contact_id_idx" ON "property_visits"("contact_id");

-- CreateIndex
CREATE INDEX "property_visits_deal_id_idx" ON "property_visits"("deal_id");

-- CreateIndex
CREATE INDEX "property_visits_scheduled_at_idx" ON "property_visits"("scheduled_at");

-- CreateIndex
CREATE INDEX "property_visits_assigned_to_user_id_idx" ON "property_visits"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "property_visits_status_idx" ON "property_visits"("status");

-- CreateIndex
CREATE INDEX "property_mandates_property_id_idx" ON "property_mandates"("property_id");

-- CreateIndex
CREATE INDEX "property_mandates_tenant_id_idx" ON "property_mandates"("tenant_id");

-- CreateIndex
CREATE INDEX "property_mandates_owner_user_id_idx" ON "property_mandates"("owner_user_id");

-- CreateIndex
CREATE INDEX "property_mandates_is_active_idx" ON "property_mandates"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "property_mandates_property_id_tenant_id_is_active_key" ON "property_mandates"("property_id", "tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "property_quality_scores_property_id_idx" ON "property_quality_scores"("property_id");

-- CreateIndex
CREATE INDEX "property_quality_scores_property_id_calculated_at_idx" ON "property_quality_scores"("property_id", "calculated_at");

-- CreateIndex
CREATE UNIQUE INDEX "properties_internal_reference_key" ON "properties"("internal_reference");

-- CreateIndex
CREATE INDEX "properties_owner_user_id_idx" ON "properties"("owner_user_id");

-- CreateIndex
CREATE INDEX "properties_property_type_idx" ON "properties"("property_type");

-- CreateIndex
CREATE INDEX "properties_ownership_type_idx" ON "properties"("ownership_type");

-- CreateIndex
CREATE INDEX "properties_status_idx" ON "properties"("status");

-- CreateIndex
CREATE INDEX "properties_is_published_idx" ON "properties"("is_published");

-- CreateIndex
CREATE INDEX "properties_latitude_longitude_idx" ON "properties"("latitude", "longitude");

-- CreateIndex
CREATE INDEX "properties_container_parent_id_idx" ON "properties"("container_parent_id");

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_container_parent_id_fkey" FOREIGN KEY ("container_parent_id") REFERENCES "properties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_documents" ADD CONSTRAINT "property_documents_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_status_history" ADD CONSTRAINT "property_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visits" ADD CONSTRAINT "property_visits_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_quality_scores" ADD CONSTRAINT "property_quality_scores_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;
