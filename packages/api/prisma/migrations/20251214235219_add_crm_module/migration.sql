-- CreateEnum
CREATE TYPE "CrmContactStatus" AS ENUM ('LEAD', 'ACTIVE_CLIENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CrmContactRoleType" AS ENUM ('PROPRIETAIRE', 'LOCATAIRE', 'COPROPRIETAIRE', 'ACQUEREUR');

-- CreateEnum
CREATE TYPE "CrmDealType" AS ENUM ('ACHAT', 'LOCATION');

-- CreateEnum
CREATE TYPE "CrmDealStage" AS ENUM ('NEW', 'QUALIFIED', 'APPOINTMENT', 'VISIT', 'NEGOTIATION', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CrmActivityType" AS ENUM ('CALL', 'EMAIL', 'SMS', 'WHATSAPP', 'VISIT', 'MEETING', 'NOTE', 'TASK', 'CORRECTION');

-- CreateEnum
CREATE TYPE "CrmActivityDirection" AS ENUM ('IN', 'OUT', 'INTERNAL');

-- CreateEnum
CREATE TYPE "CrmAppointmentType" AS ENUM ('RDV', 'VISITE');

-- CreateEnum
CREATE TYPE "CrmAppointmentStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'DONE', 'NO_SHOW', 'CANCELED');

-- CreateEnum
CREATE TYPE "CrmDealPropertyStatus" AS ENUM ('SHORTLISTED', 'PROPOSED', 'VISITED', 'REJECTED', 'SELECTED');

-- CreateEnum
CREATE TYPE "CrmEntityType" AS ENUM ('CONTACT', 'DEAL', 'PROPERTY');

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "source" TEXT,
    "status" "CrmContactStatus" NOT NULL DEFAULT 'LEAD',
    "assigned_to_user_id" TEXT,
    "last_interaction_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contact_roles" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "role" "CrmContactRoleType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contact_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deals" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "type" "CrmDealType" NOT NULL,
    "stage" "CrmDealStage" NOT NULL DEFAULT 'NEW',
    "budget_min" DECIMAL(12,2),
    "budget_max" DECIMAL(12,2),
    "location_zone" TEXT,
    "criteria_json" JSONB,
    "expected_value" DECIMAL(12,2),
    "probability" DOUBLE PRECISION,
    "assigned_to_user_id" TEXT,
    "closed_reason" TEXT,
    "closed_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_activities" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT,
    "deal_id" TEXT,
    "activity_type" "CrmActivityType" NOT NULL,
    "direction" "CrmActivityDirection",
    "subject" TEXT,
    "content" TEXT NOT NULL,
    "outcome" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "next_action_at" TIMESTAMP(3),
    "next_action_type" TEXT,
    "correction_of_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_appointments" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "deal_id" TEXT,
    "appointment_type" "CrmAppointmentType" NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "end_at" TIMESTAMP(3) NOT NULL,
    "location" TEXT,
    "status" "CrmAppointmentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_by_user_id" TEXT NOT NULL,
    "assigned_to_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_deal_properties" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deal_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "source_owner_contact_id" TEXT,
    "matchScore" INTEGER,
    "match_explanation_json" JSONB,
    "status" "CrmDealPropertyStatus" NOT NULL DEFAULT 'SHORTLISTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_deal_properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_tags" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contact_tags" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_contact_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_notes" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "entity_type" "CrmEntityType" NOT NULL,
    "entity_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "crmContactId" TEXT,
    "crmDealId" TEXT,

    CONSTRAINT "crm_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "location_zone" TEXT,
    "rooms" INTEGER,
    "surface" DECIMAL(10,2),
    "type" TEXT,
    "furnishing_status" TEXT,
    "status" TEXT DEFAULT 'available',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_contacts_tenant_id_idx" ON "crm_contacts"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_contacts_tenant_id_status_idx" ON "crm_contacts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "crm_contacts_assigned_to_user_id_idx" ON "crm_contacts"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "crm_contacts_last_interaction_at_idx" ON "crm_contacts"("last_interaction_at");

-- CreateIndex
CREATE INDEX "crm_contacts_email_idx" ON "crm_contacts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contacts_tenant_id_email_key" ON "crm_contacts"("tenant_id", "email");

-- CreateIndex
CREATE INDEX "crm_contact_roles_tenant_id_idx" ON "crm_contact_roles"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_contact_roles_contact_id_idx" ON "crm_contact_roles"("contact_id");

-- CreateIndex
CREATE INDEX "crm_contact_roles_tenant_id_contact_id_active_idx" ON "crm_contact_roles"("tenant_id", "contact_id", "active");

-- CreateIndex
CREATE INDEX "crm_deals_tenant_id_idx" ON "crm_deals"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_deals_tenant_id_contact_id_idx" ON "crm_deals"("tenant_id", "contact_id");

-- CreateIndex
CREATE INDEX "crm_deals_tenant_id_stage_idx" ON "crm_deals"("tenant_id", "stage");

-- CreateIndex
CREATE INDEX "crm_deals_assigned_to_user_id_idx" ON "crm_deals"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "crm_deals_created_at_idx" ON "crm_deals"("created_at");

-- CreateIndex
CREATE INDEX "crm_activities_tenant_id_idx" ON "crm_activities"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_activities_tenant_id_contact_id_idx" ON "crm_activities"("tenant_id", "contact_id");

-- CreateIndex
CREATE INDEX "crm_activities_tenant_id_deal_id_idx" ON "crm_activities"("tenant_id", "deal_id");

-- CreateIndex
CREATE INDEX "crm_activities_created_by_user_id_idx" ON "crm_activities"("created_by_user_id");

-- CreateIndex
CREATE INDEX "crm_activities_occurred_at_idx" ON "crm_activities"("occurred_at");

-- CreateIndex
CREATE INDEX "crm_activities_next_action_at_idx" ON "crm_activities"("next_action_at");

-- CreateIndex
CREATE INDEX "crm_appointments_tenant_id_idx" ON "crm_appointments"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_appointments_tenant_id_contact_id_idx" ON "crm_appointments"("tenant_id", "contact_id");

-- CreateIndex
CREATE INDEX "crm_appointments_tenant_id_deal_id_idx" ON "crm_appointments"("tenant_id", "deal_id");

-- CreateIndex
CREATE INDEX "crm_appointments_assigned_to_user_id_idx" ON "crm_appointments"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "crm_appointments_start_at_idx" ON "crm_appointments"("start_at");

-- CreateIndex
CREATE INDEX "crm_appointments_status_idx" ON "crm_appointments"("status");

-- CreateIndex
CREATE INDEX "crm_deal_properties_tenant_id_idx" ON "crm_deal_properties"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_deal_properties_tenant_id_deal_id_idx" ON "crm_deal_properties"("tenant_id", "deal_id");

-- CreateIndex
CREATE INDEX "crm_deal_properties_property_id_idx" ON "crm_deal_properties"("property_id");

-- CreateIndex
CREATE INDEX "crm_deal_properties_matchScore_idx" ON "crm_deal_properties"("matchScore");

-- CreateIndex
CREATE UNIQUE INDEX "crm_deal_properties_tenant_id_deal_id_property_id_key" ON "crm_deal_properties"("tenant_id", "deal_id", "property_id");

-- CreateIndex
CREATE INDEX "crm_tags_tenant_id_idx" ON "crm_tags"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_tags_tenant_id_name_key" ON "crm_tags"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "crm_contact_tags_contact_id_idx" ON "crm_contact_tags"("contact_id");

-- CreateIndex
CREATE INDEX "crm_contact_tags_tag_id_idx" ON "crm_contact_tags"("tag_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contact_tags_contact_id_tag_id_key" ON "crm_contact_tags"("contact_id", "tag_id");

-- CreateIndex
CREATE INDEX "crm_notes_tenant_id_idx" ON "crm_notes"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_notes_tenant_id_entity_type_entity_id_idx" ON "crm_notes"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "crm_notes_created_by_user_id_idx" ON "crm_notes"("created_by_user_id");

-- CreateIndex
CREATE INDEX "properties_tenant_id_idx" ON "properties"("tenant_id");

-- CreateIndex
CREATE INDEX "properties_tenant_id_status_idx" ON "properties"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "properties_location_zone_idx" ON "properties"("location_zone");

-- CreateIndex
CREATE INDEX "properties_price_idx" ON "properties"("price");

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contact_roles" ADD CONSTRAINT "crm_contact_roles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contact_roles" ADD CONSTRAINT "crm_contact_roles_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deals" ADD CONSTRAINT "crm_deals_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_activities" ADD CONSTRAINT "crm_activities_correction_of_id_fkey" FOREIGN KEY ("correction_of_id") REFERENCES "crm_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_appointments" ADD CONSTRAINT "crm_appointments_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_properties" ADD CONSTRAINT "crm_deal_properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_properties" ADD CONSTRAINT "crm_deal_properties_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "crm_deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_properties" ADD CONSTRAINT "crm_deal_properties_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_deal_properties" ADD CONSTRAINT "crm_deal_properties_source_owner_contact_id_fkey" FOREIGN KEY ("source_owner_contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_tags" ADD CONSTRAINT "crm_tags_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contact_tags" ADD CONSTRAINT "crm_contact_tags_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contact_tags" ADD CONSTRAINT "crm_contact_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "crm_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_crmContactId_fkey" FOREIGN KEY ("crmContactId") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_notes" ADD CONSTRAINT "crm_notes_crmDealId_fkey" FOREIGN KEY ("crmDealId") REFERENCES "crm_deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
