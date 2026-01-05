-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('SUPER_ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "TenantType" AS ENUM ('AGENCY', 'OPERATOR');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('OWNER', 'RENTER', 'BUYER', 'CO_OWNER');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ModuleKey" AS ENUM ('MODULE_AGENCY', 'MODULE_SYNDIC', 'MODULE_PROMOTER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('PENDING_INVITE', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('PLATFORM', 'TENANT');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('BASIC', 'PRO', 'ELITE');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'FAILED', 'CANCELED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "CrmContactStatus" AS ENUM ('LEAD', 'ACTIVE_CLIENT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "CrmContactRoleType" AS ENUM ('PROPRIETAIRE', 'LOCATAIRE', 'COPROPRIETAIRE', 'ACQUEREUR');

-- CreateEnum
CREATE TYPE "CrmContactType" AS ENUM ('PERSON', 'COMPANY');

-- CreateEnum
CREATE TYPE "Civility" AS ENUM ('MR', 'MRS', 'MS', 'DR', 'PROF');

-- CreateEnum
CREATE TYPE "IdentityDocumentType" AS ENUM ('CNI', 'PASSPORT', 'DRIVING_LICENSE', 'OTHER');

-- CreateEnum
CREATE TYPE "LegalForm" AS ENUM ('SARL', 'SA', 'EI', 'EURL', 'SAS', 'ASSOCIATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CrmProjectType" AS ENUM ('BUY', 'RENT', 'SELL', 'MANAGE', 'INVEST');

-- CreateEnum
CREATE TYPE "CrmUrgencyLevel" AS ENUM ('IMMEDIATE', 'LESS_THAN_3_MONTHS', 'THREE_TO_SIX_MONTHS', 'MORE_THAN_6_MONTHS');

-- CreateEnum
CREATE TYPE "CrmProjectPropertyType" AS ENUM ('LAND', 'APARTMENT', 'VILLA', 'OFFICE', 'SHOP', 'WAREHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "IntendedUse" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED');

-- CreateEnum
CREATE TYPE "FinancingMode" AS ENUM ('CASH', 'CREDIT', 'MIXED');

-- CreateEnum
CREATE TYPE "JobStability" AS ENUM ('CDI', 'CDD', 'FREELANCE', 'INFORMAL', 'RETIRED', 'STUDENT', 'UNEMPLOYED', 'OTHER');

-- CreateEnum
CREATE TYPE "BorrowingCapacity" AS ENUM ('YES', 'NO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "LeadSource" AS ENUM ('WEBSITE', 'SOCIAL_MEDIA', 'REFERRAL', 'CAMPAIGN', 'AGENCY', 'WALK_IN', 'PHONE_CALL', 'OTHER');

-- CreateEnum
CREATE TYPE "MaturityLevel" AS ENUM ('COLD', 'WARM', 'HOT');

-- CreateEnum
CREATE TYPE "PreferredContactChannel" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('MOBILE_MONEY', 'BANK_TRANSFER', 'CASH', 'CHECK', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "PriorityLevel" AS ENUM ('LOW', 'NORMAL', 'HIGH');

-- CreateEnum
CREATE TYPE "CrmDealType" AS ENUM ('ACHAT', 'LOCATION', 'VENTE', 'GESTION', 'MANDAT');

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
CREATE TYPE "PropertyVisitGoal" AS ENUM ('CONTACT_TAKING', 'NETWORKING', 'EVALUATION', 'CONTRACT_SIGNING', 'FOLLOW_UP', 'NEGOTIATION', 'OTHER');

-- CreateEnum
CREATE TYPE "PropertyVisitStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'DONE', 'NO_SHOW', 'CANCELED');

-- CreateEnum
CREATE TYPE "RentalLeaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED', 'CANCELED');

-- CreateEnum
CREATE TYPE "RentalBillingFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ANNUAL');

-- CreateEnum
CREATE TYPE "RentalInstallmentStatus" AS ENUM ('DRAFT', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELED');

-- CreateEnum
CREATE TYPE "RentalChargeType" AS ENUM ('RENT', 'SERVICE_CHARGE', 'UTILITY', 'MAINTENANCE', 'DOSSIER_FEE', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalPaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CHECK', 'MOBILE_MONEY', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalPaymentStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "MobileMoneyOperator" AS ENUM ('ORANGE', 'MTN', 'MOOV', 'WAVE', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalPenaltyMode" AS ENUM ('FIXED_AMOUNT', 'PERCENT_OF_RENT', 'PERCENT_OF_BALANCE');

-- CreateEnum
CREATE TYPE "RentalDepositMovementType" AS ENUM ('COLLECT', 'HOLD', 'RELEASE', 'REFUND', 'FORFEIT', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RentalDocumentType" AS ENUM ('LEASE_CONTRACT', 'LEASE_ADDENDUM', 'RENT_RECEIPT', 'RENT_QUITTANCE', 'DEPOSIT_RECEIPT', 'STATEMENT', 'OTHER');

-- CreateEnum
CREATE TYPE "RentalDocumentStatus" AS ENUM ('DRAFT', 'FINAL', 'VOID', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DocumentTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('LEASE_HABITATION', 'LEASE_COMMERCIAL', 'RENT_RECEIPT', 'RENT_STATEMENT');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_id" TEXT,
    "full_name" TEXT,
    "avatar_url" TEXT,
    "global_role" "GlobalRole" NOT NULL DEFAULT 'USER',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "type" "TenantType" NOT NULL,
    "logo_url" TEXT,
    "website" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "legal_name" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'PENDING',
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "country" TEXT,
    "city" TEXT,
    "address" TEXT,
    "branding_primary_color" TEXT,
    "subdomain" TEXT,
    "custom_domain" TEXT,
    "last_activity_at" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_clients" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "client_type" "ClientType" NOT NULL,
    "details" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "revoked_at" TIMESTAMP(3),
    "device_info" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_verification_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "used" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_modules" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "module_key" "ModuleKey" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" TIMESTAMP(3),
    "enabled_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_modules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "status" "MembershipStatus" NOT NULL DEFAULT 'PENDING_INVITE',
    "invited_at" TIMESTAMP(3),
    "invited_by" TEXT,
    "accepted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "RoleScope" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "permission_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_roles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "tenant_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invitations" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "invited_by" TEXT NOT NULL,
    "accepted_by" TEXT,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "plan_key" "SubscriptionPlan" NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "start_at" TIMESTAMP(3) NOT NULL,
    "current_period_start" TIMESTAMP(3) NOT NULL,
    "current_period_end" TIMESTAMP(3) NOT NULL,
    "cancel_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "invoice_number" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount_total" DECIMAL(10,2) NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "paid_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "tenant_id" TEXT,
    "action_key" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "contact_type" "CrmContactType" DEFAULT 'PERSON',
    "civility" "Civility",
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "date_of_birth" TIMESTAMP(3),
    "nationality" TEXT,
    "identity_document_type" "IdentityDocumentType",
    "identity_document_number" TEXT,
    "identity_document_expiry" TIMESTAMP(3),
    "profile_photo_url" TEXT,
    "legal_name" TEXT,
    "legal_form" "LegalForm",
    "rccm" TEXT,
    "tax_id" TEXT,
    "representative_name" TEXT,
    "representative_role" TEXT,
    "email" TEXT NOT NULL,
    "email_secondary" TEXT,
    "phone_primary" TEXT,
    "phone_secondary" TEXT,
    "whatsapp_number" TEXT,
    "address" TEXT,
    "city" TEXT,
    "district" TEXT,
    "country" TEXT,
    "commune_id" TEXT,
    "location_zone" TEXT,
    "preferred_language" TEXT,
    "preferred_contact_channel" "PreferredContactChannel",
    "project_intent_json" JSONB,
    "profession" TEXT,
    "sector_of_activity" TEXT,
    "employer" TEXT,
    "income_min" DECIMAL(12,2),
    "income_max" DECIMAL(12,2),
    "job_stability" "JobStability",
    "borrowing_capacity" "BorrowingCapacity",
    "source" TEXT,
    "lead_source_enum" "LeadSource",
    "maturity_level" "MaturityLevel" DEFAULT 'COLD',
    "score" INTEGER DEFAULT 0,
    "responsiveness_rate" DECIMAL(5,2),
    "last_interaction_at" TIMESTAMP(3),
    "next_action_at" TIMESTAMP(3),
    "status" "CrmContactStatus" NOT NULL DEFAULT 'LEAD',
    "assigned_to_user_id" TEXT,
    "priority_level" "PriorityLevel" DEFAULT 'NORMAL',
    "balance" DECIMAL(12,2),
    "total_paid" DECIMAL(12,2),
    "total_due" DECIMAL(12,2),
    "deposit_amount" DECIMAL(12,2),
    "payment_incidents_count" INTEGER DEFAULT 0,
    "preferred_payment_method" "PaymentMethod",
    "consent_marketing" BOOLEAN DEFAULT false,
    "consent_whatsapp" BOOLEAN DEFAULT false,
    "consent_email" BOOLEAN DEFAULT false,
    "consent_date" TIMESTAMP(3),
    "consent_source" TEXT,
    "fonction" TEXT,
    "salaire" DECIMAL(12,2),
    "numero_piece_id" TEXT,
    "internal_notes" TEXT,
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
    "contact_id" TEXT NOT NULL,
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
CREATE TABLE "crm_appointment_collaborators" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_appointment_collaborators_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "crm_contact_target_zones" (
    "id" TEXT NOT NULL,
    "contact_id" TEXT NOT NULL,
    "commune_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_contact_target_zones_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "properties" (
    "id" TEXT NOT NULL,
    "internal_reference" TEXT NOT NULL,
    "property_type" "PropertyType" NOT NULL,
    "ownership_type" "PropertyOwnershipType" NOT NULL,
    "tenant_id" TEXT,
    "owner_user_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "location_zone" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "transaction_modes" "PropertyTransactionMode"[],
    "price" DOUBLE PRECISION,
    "fees" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "surface_area" DOUBLE PRECISION,
    "surface_useful" DOUBLE PRECISION,
    "surface_terrain" DOUBLE PRECISION,
    "rooms" INTEGER,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "furnishing_status" "PropertyFurnishingStatus",
    "status" "PropertyStatus" NOT NULL DEFAULT 'DRAFT',
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "published_at" TIMESTAMP(3),
    "availability" "PropertyAvailability" NOT NULL DEFAULT 'AVAILABLE',
    "quality_score" INTEGER,
    "quality_score_updated_at" TIMESTAMP(3),
    "type_specific_data" JSONB,
    "container_parent_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
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
    "goal" "PropertyVisitGoal",
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
CREATE TABLE "property_visit_collaborators" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_visit_collaborators_pkey" PRIMARY KEY ("id")
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
CREATE TABLE "countries" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_fr" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_fr" TEXT,
    "capital" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communes" (
    "id" TEXT NOT NULL,
    "region_id" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "name_fr" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "communes_pkey" PRIMARY KEY ("id")
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

-- CreateTable
CREATE TABLE "rental_leases" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "primary_renter_client_id" TEXT NOT NULL,
    "owner_client_id" TEXT,
    "crm_deal_id" TEXT,
    "lease_number" TEXT NOT NULL,
    "status" "RentalLeaseStatus" NOT NULL DEFAULT 'DRAFT',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "move_in_date" TIMESTAMP(3),
    "move_out_date" TIMESTAMP(3),
    "billing_frequency" "RentalBillingFrequency" NOT NULL DEFAULT 'MONTHLY',
    "due_day_of_month" INTEGER NOT NULL DEFAULT 5,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "rent_amount" DECIMAL(12,2) NOT NULL,
    "service_charge_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "security_deposit_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty_grace_days" INTEGER NOT NULL DEFAULT 0,
    "penalty_mode" "RentalPenaltyMode" NOT NULL DEFAULT 'PERCENT_OF_BALANCE',
    "penalty_rate" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "penalty_fixed_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty_cap_amount" DECIMAL(12,2),
    "notes" TEXT,
    "terms_json" JSONB,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_leases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_lease_co_renters" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "renter_client_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_lease_co_renters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_installments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "period_year" INTEGER NOT NULL,
    "period_month" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3) NOT NULL,
    "status" "RentalInstallmentStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount_rent" DECIMAL(12,2) NOT NULL,
    "amount_service" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_other_fees" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid_at" TIMESTAMP(3),
    "invoice_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_installments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_installment_items" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "installment_id" UUID NOT NULL,
    "charge_type" "RentalChargeType" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_installment_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_payments" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID,
    "renter_client_id" TEXT,
    "invoice_id" TEXT,
    "method" "RentalPaymentMethod" NOT NULL,
    "status" "RentalPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount" DECIMAL(12,2) NOT NULL,
    "mm_operator" "MobileMoneyOperator",
    "mm_phone" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "psp_name" TEXT,
    "psp_transaction_id" TEXT,
    "psp_reference" TEXT,
    "initiated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "succeeded_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "canceled_at" TIMESTAMP(3),
    "raw_event_payload" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_payment_allocations" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_refunds" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "payment_id" UUID NOT NULL,
    "status" "RentalPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount" DECIMAL(12,2) NOT NULL,
    "psp_refund_id" TEXT,
    "raw_event_payload" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_penalty_rules" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "grace_days" INTEGER NOT NULL DEFAULT 0,
    "mode" "RentalPenaltyMode" NOT NULL DEFAULT 'PERCENT_OF_BALANCE',
    "fixed_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "cap_amount" DECIMAL(12,2),
    "min_balance_to_apply" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_penalty_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_penalties" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "installment_id" UUID NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "days_late" INTEGER NOT NULL,
    "mode" "RentalPenaltyMode" NOT NULL,
    "rate" DECIMAL(12,4),
    "fixed_amount" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "is_manual_override" BOOLEAN NOT NULL DEFAULT false,
    "override_reason" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_penalties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_security_deposits" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "lease_id" UUID NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "target_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collected_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "held_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refunded_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "forfeited_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_security_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_deposit_movements" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "deposit_id" UUID NOT NULL,
    "type" "RentalDepositMovementType" NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'FCFA',
    "amount" DECIMAL(12,2) NOT NULL,
    "payment_id" UUID,
    "installment_id" UUID,
    "note" TEXT,
    "metadata" JSONB,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rental_deposit_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rental_documents" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" "RentalDocumentType" NOT NULL,
    "status" "RentalDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "lease_id" UUID,
    "installment_id" UUID,
    "payment_id" UUID,
    "document_number" TEXT,
    "file_url" TEXT,
    "file_key" TEXT,
    "file_path" TEXT,
    "mime_type" TEXT,
    "content_hash" TEXT,
    "file_hash" TEXT,
    "issued_at" TIMESTAMP(3),
    "title" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "template_id" UUID,
    "template_hash" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "superseded_by_id" UUID,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rental_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_templates" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT,
    "doc_type" "DocumentType" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'INACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "original_filename" TEXT NOT NULL,
    "stored_filename" TEXT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "file_hash_sha256" TEXT NOT NULL,
    "placeholders" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_counters" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_type" "DocumentType" NOT NULL,
    "period_key" TEXT NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "tenants_slug_idx" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_contact_email_idx" ON "tenants"("contact_email");

-- CreateIndex
CREATE INDEX "tenant_clients_user_id_idx" ON "tenant_clients"("user_id");

-- CreateIndex
CREATE INDEX "tenant_clients_tenant_id_idx" ON "tenant_clients"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_clients_user_id_tenant_id_key" ON "tenant_clients"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_token_idx" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_key" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "password_reset_tokens_token_idx" ON "password_reset_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "email_verification_tokens_token_key" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "email_verification_tokens_user_id_idx" ON "email_verification_tokens"("user_id");

-- CreateIndex
CREATE INDEX "email_verification_tokens_token_idx" ON "email_verification_tokens"("token");

-- CreateIndex
CREATE INDEX "tenant_modules_tenant_id_idx" ON "tenant_modules"("tenant_id");

-- CreateIndex
CREATE INDEX "tenant_modules_module_key_idx" ON "tenant_modules"("module_key");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_modules_tenant_id_module_key_key" ON "tenant_modules"("tenant_id", "module_key");

-- CreateIndex
CREATE INDEX "memberships_user_id_idx" ON "memberships"("user_id");

-- CreateIndex
CREATE INDEX "memberships_tenant_id_idx" ON "memberships"("tenant_id");

-- CreateIndex
CREATE INDEX "memberships_status_idx" ON "memberships"("status");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_user_id_tenant_id_key" ON "memberships"("user_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "roles_key_key" ON "roles"("key");

-- CreateIndex
CREATE INDEX "roles_scope_idx" ON "roles"("scope");

-- CreateIndex
CREATE INDEX "roles_key_idx" ON "roles"("key");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_key_idx" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "role_permissions_role_id_idx" ON "role_permissions"("role_id");

-- CreateIndex
CREATE INDEX "role_permissions_permission_id_idx" ON "role_permissions"("permission_id");

-- CreateIndex
CREATE UNIQUE INDEX "role_permissions_role_id_permission_id_key" ON "role_permissions"("role_id", "permission_id");

-- CreateIndex
CREATE INDEX "user_roles_user_id_idx" ON "user_roles"("user_id");

-- CreateIndex
CREATE INDEX "user_roles_role_id_idx" ON "user_roles"("role_id");

-- CreateIndex
CREATE INDEX "user_roles_tenant_id_idx" ON "user_roles"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_roles_user_id_role_id_tenant_id_key" ON "user_roles"("user_id", "role_id", "tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_idx" ON "invitations"("tenant_id");

-- CreateIndex
CREATE INDEX "invitations_email_idx" ON "invitations"("email");

-- CreateIndex
CREATE INDEX "invitations_token_hash_idx" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_status_idx" ON "invitations"("status");

-- CreateIndex
CREATE INDEX "invitations_expires_at_idx" ON "invitations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_tenant_id_key" ON "subscriptions"("tenant_id");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_plan_key_idx" ON "subscriptions"("plan_key");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_invoice_number_key" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_tenant_id_idx" ON "invoices"("tenant_id");

-- CreateIndex
CREATE INDEX "invoices_subscription_id_idx" ON "invoices"("subscription_id");

-- CreateIndex
CREATE INDEX "invoices_invoice_number_idx" ON "invoices"("invoice_number");

-- CreateIndex
CREATE INDEX "invoices_status_idx" ON "invoices"("status");

-- CreateIndex
CREATE INDEX "invoices_due_date_idx" ON "invoices"("due_date");

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_idx" ON "audit_logs"("actor_user_id");

-- CreateIndex
CREATE INDEX "audit_logs_tenant_id_idx" ON "audit_logs"("tenant_id");

-- CreateIndex
CREATE INDEX "audit_logs_action_key_idx" ON "audit_logs"("action_key");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "crm_contacts_tenant_id_idx" ON "crm_contacts"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_contacts_tenant_id_status_idx" ON "crm_contacts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "crm_contacts_tenant_id_contact_type_idx" ON "crm_contacts"("tenant_id", "contact_type");

-- CreateIndex
CREATE INDEX "crm_contacts_tenant_id_maturity_level_idx" ON "crm_contacts"("tenant_id", "maturity_level");

-- CreateIndex
CREATE INDEX "crm_contacts_tenant_id_score_idx" ON "crm_contacts"("tenant_id", "score");

-- CreateIndex
CREATE INDEX "crm_contacts_assigned_to_user_id_idx" ON "crm_contacts"("assigned_to_user_id");

-- CreateIndex
CREATE INDEX "crm_contacts_last_interaction_at_idx" ON "crm_contacts"("last_interaction_at");

-- CreateIndex
CREATE INDEX "crm_contacts_next_action_at_idx" ON "crm_contacts"("next_action_at");

-- CreateIndex
CREATE INDEX "crm_contacts_email_idx" ON "crm_contacts"("email");

-- CreateIndex
CREATE INDEX "crm_contacts_phone_primary_idx" ON "crm_contacts"("phone_primary");

-- CreateIndex
CREATE INDEX "crm_contacts_whatsapp_number_idx" ON "crm_contacts"("whatsapp_number");

-- CreateIndex
CREATE INDEX "crm_contacts_identity_document_number_idx" ON "crm_contacts"("identity_document_number");

-- CreateIndex
CREATE INDEX "crm_contacts_location_zone_idx" ON "crm_contacts"("location_zone");

-- CreateIndex
CREATE INDEX "crm_contacts_commune_id_idx" ON "crm_contacts"("commune_id");

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
CREATE INDEX "crm_appointment_collaborators_appointment_id_idx" ON "crm_appointment_collaborators"("appointment_id");

-- CreateIndex
CREATE INDEX "crm_appointment_collaborators_user_id_idx" ON "crm_appointment_collaborators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_appointment_collaborators_appointment_id_user_id_key" ON "crm_appointment_collaborators"("appointment_id", "user_id");

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
CREATE INDEX "crm_contact_target_zones_contact_id_idx" ON "crm_contact_target_zones"("contact_id");

-- CreateIndex
CREATE INDEX "crm_contact_target_zones_commune_id_idx" ON "crm_contact_target_zones"("commune_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_contact_target_zones_contact_id_commune_id_key" ON "crm_contact_target_zones"("contact_id", "commune_id");

-- CreateIndex
CREATE INDEX "crm_notes_tenant_id_idx" ON "crm_notes"("tenant_id");

-- CreateIndex
CREATE INDEX "crm_notes_tenant_id_entity_type_entity_id_idx" ON "crm_notes"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "crm_notes_created_by_user_id_idx" ON "crm_notes"("created_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_type_templates_property_type_key" ON "property_type_templates"("property_type");

-- CreateIndex
CREATE UNIQUE INDEX "properties_internal_reference_key" ON "properties"("internal_reference");

-- CreateIndex
CREATE INDEX "properties_tenant_id_idx" ON "properties"("tenant_id");

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
CREATE INDEX "properties_location_zone_idx" ON "properties"("location_zone");

-- CreateIndex
CREATE INDEX "properties_container_parent_id_idx" ON "properties"("container_parent_id");

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
CREATE INDEX "property_visit_collaborators_visit_id_idx" ON "property_visit_collaborators"("visit_id");

-- CreateIndex
CREATE INDEX "property_visit_collaborators_user_id_idx" ON "property_visit_collaborators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_visit_collaborators_visit_id_user_id_key" ON "property_visit_collaborators"("visit_id", "user_id");

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
CREATE UNIQUE INDEX "countries_code_key" ON "countries"("code");

-- CreateIndex
CREATE INDEX "countries_code_idx" ON "countries"("code");

-- CreateIndex
CREATE INDEX "countries_is_active_idx" ON "countries"("is_active");

-- CreateIndex
CREATE INDEX "regions_country_id_idx" ON "regions"("country_id");

-- CreateIndex
CREATE INDEX "regions_code_idx" ON "regions"("code");

-- CreateIndex
CREATE INDEX "regions_is_active_idx" ON "regions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "regions_country_id_name_key" ON "regions"("country_id", "name");

-- CreateIndex
CREATE INDEX "communes_region_id_idx" ON "communes"("region_id");

-- CreateIndex
CREATE INDEX "communes_code_idx" ON "communes"("code");

-- CreateIndex
CREATE INDEX "communes_is_active_idx" ON "communes"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "communes_region_id_name_key" ON "communes"("region_id", "name");

-- CreateIndex
CREATE INDEX "property_quality_scores_property_id_idx" ON "property_quality_scores"("property_id");

-- CreateIndex
CREATE INDEX "property_quality_scores_property_id_calculated_at_idx" ON "property_quality_scores"("property_id", "calculated_at");

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_idx" ON "rental_leases"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_status_idx" ON "rental_leases"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_property_id_idx" ON "rental_leases"("tenant_id", "property_id");

-- CreateIndex
CREATE INDEX "rental_leases_tenant_id_primary_renter_client_id_idx" ON "rental_leases"("tenant_id", "primary_renter_client_id");

-- CreateIndex
CREATE INDEX "rental_leases_crm_deal_id_idx" ON "rental_leases"("crm_deal_id");

-- CreateIndex
CREATE INDEX "rental_leases_start_date_idx" ON "rental_leases"("start_date");

-- CreateIndex
CREATE INDEX "rental_leases_end_date_idx" ON "rental_leases"("end_date");

-- CreateIndex
CREATE UNIQUE INDEX "rental_leases_tenant_id_lease_number_key" ON "rental_leases"("tenant_id", "lease_number");

-- CreateIndex
CREATE INDEX "rental_lease_co_renters_tenant_id_idx" ON "rental_lease_co_renters"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_lease_co_renters_lease_id_idx" ON "rental_lease_co_renters"("lease_id");

-- CreateIndex
CREATE INDEX "rental_lease_co_renters_renter_client_id_idx" ON "rental_lease_co_renters"("renter_client_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_lease_co_renters_lease_id_renter_client_id_key" ON "rental_lease_co_renters"("lease_id", "renter_client_id");

-- CreateIndex
CREATE INDEX "rental_installments_tenant_id_idx" ON "rental_installments"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_installments_tenant_id_status_idx" ON "rental_installments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "rental_installments_tenant_id_due_date_idx" ON "rental_installments"("tenant_id", "due_date");

-- CreateIndex
CREATE INDEX "rental_installments_lease_id_idx" ON "rental_installments"("lease_id");

-- CreateIndex
CREATE INDEX "rental_installments_invoice_id_idx" ON "rental_installments"("invoice_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_installments_lease_id_period_year_period_month_key" ON "rental_installments"("lease_id", "period_year", "period_month");

-- CreateIndex
CREATE INDEX "rental_installment_items_tenant_id_idx" ON "rental_installment_items"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_installment_items_installment_id_idx" ON "rental_installment_items"("installment_id");

-- CreateIndex
CREATE INDEX "rental_installment_items_charge_type_idx" ON "rental_installment_items"("charge_type");

-- CreateIndex
CREATE UNIQUE INDEX "rental_payments_idempotency_key_key" ON "rental_payments"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "rental_payments_psp_transaction_id_key" ON "rental_payments"("psp_transaction_id");

-- CreateIndex
CREATE INDEX "rental_payments_tenant_id_idx" ON "rental_payments"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_payments_tenant_id_status_idx" ON "rental_payments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "rental_payments_tenant_id_method_idx" ON "rental_payments"("tenant_id", "method");

-- CreateIndex
CREATE INDEX "rental_payments_lease_id_idx" ON "rental_payments"("lease_id");

-- CreateIndex
CREATE INDEX "rental_payments_invoice_id_idx" ON "rental_payments"("invoice_id");

-- CreateIndex
CREATE INDEX "rental_payments_renter_client_id_idx" ON "rental_payments"("renter_client_id");

-- CreateIndex
CREATE INDEX "rental_payments_initiated_at_idx" ON "rental_payments"("initiated_at");

-- CreateIndex
CREATE INDEX "rental_payment_allocations_tenant_id_idx" ON "rental_payment_allocations"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_payment_allocations_payment_id_idx" ON "rental_payment_allocations"("payment_id");

-- CreateIndex
CREATE INDEX "rental_payment_allocations_installment_id_idx" ON "rental_payment_allocations"("installment_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_payment_allocations_payment_id_installment_id_key" ON "rental_payment_allocations"("payment_id", "installment_id");

-- CreateIndex
CREATE UNIQUE INDEX "rental_refunds_psp_refund_id_key" ON "rental_refunds"("psp_refund_id");

-- CreateIndex
CREATE INDEX "rental_refunds_tenant_id_idx" ON "rental_refunds"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_refunds_payment_id_idx" ON "rental_refunds"("payment_id");

-- CreateIndex
CREATE INDEX "rental_refunds_tenant_id_status_idx" ON "rental_refunds"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "rental_penalty_rules_tenant_id_idx" ON "rental_penalty_rules"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_penalty_rules_tenant_id_is_active_idx" ON "rental_penalty_rules"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "rental_penalties_tenant_id_idx" ON "rental_penalties"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_penalties_installment_id_idx" ON "rental_penalties"("installment_id");

-- CreateIndex
CREATE INDEX "rental_penalties_calculated_at_idx" ON "rental_penalties"("calculated_at");

-- CreateIndex
CREATE UNIQUE INDEX "rental_security_deposits_lease_id_key" ON "rental_security_deposits"("lease_id");

-- CreateIndex
CREATE INDEX "rental_security_deposits_tenant_id_idx" ON "rental_security_deposits"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_tenant_id_idx" ON "rental_deposit_movements"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_deposit_id_idx" ON "rental_deposit_movements"("deposit_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_payment_id_idx" ON "rental_deposit_movements"("payment_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_installment_id_idx" ON "rental_deposit_movements"("installment_id");

-- CreateIndex
CREATE INDEX "rental_deposit_movements_created_at_idx" ON "rental_deposit_movements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rental_documents_document_number_key" ON "rental_documents"("document_number");

-- CreateIndex
CREATE INDEX "rental_documents_tenant_id_idx" ON "rental_documents"("tenant_id");

-- CreateIndex
CREATE INDEX "rental_documents_tenant_id_type_idx" ON "rental_documents"("tenant_id", "type");

-- CreateIndex
CREATE INDEX "rental_documents_lease_id_idx" ON "rental_documents"("lease_id");

-- CreateIndex
CREATE INDEX "rental_documents_installment_id_idx" ON "rental_documents"("installment_id");

-- CreateIndex
CREATE INDEX "rental_documents_payment_id_idx" ON "rental_documents"("payment_id");

-- CreateIndex
CREATE INDEX "rental_documents_issued_at_idx" ON "rental_documents"("issued_at");

-- CreateIndex
CREATE INDEX "rental_documents_template_id_idx" ON "rental_documents"("template_id");

-- CreateIndex
CREATE INDEX "rental_documents_superseded_by_id_idx" ON "rental_documents"("superseded_by_id");

-- CreateIndex
CREATE INDEX "document_templates_tenant_id_idx" ON "document_templates"("tenant_id");

-- CreateIndex
CREATE INDEX "document_templates_tenant_id_doc_type_idx" ON "document_templates"("tenant_id", "doc_type");

-- CreateIndex
CREATE INDEX "document_templates_tenant_id_doc_type_status_idx" ON "document_templates"("tenant_id", "doc_type", "status");

-- CreateIndex
CREATE INDEX "document_templates_status_idx" ON "document_templates"("status");

-- CreateIndex
CREATE UNIQUE INDEX "document_templates_tenant_id_doc_type_is_default_key" ON "document_templates"("tenant_id", "doc_type", "is_default");

-- CreateIndex
CREATE INDEX "document_counters_tenant_id_idx" ON "document_counters"("tenant_id");

-- CreateIndex
CREATE INDEX "document_counters_tenant_id_doc_type_idx" ON "document_counters"("tenant_id", "doc_type");

-- CreateIndex
CREATE UNIQUE INDEX "document_counters_tenant_id_doc_type_period_key_key" ON "document_counters"("tenant_id", "doc_type", "period_key");

-- AddForeignKey
ALTER TABLE "tenant_clients" ADD CONSTRAINT "tenant_clients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_clients" ADD CONSTRAINT "tenant_clients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_verification_tokens" ADD CONSTRAINT "email_verification_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_modules" ADD CONSTRAINT "tenant_modules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_fkey" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_fkey" FOREIGN KEY ("accepted_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

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
ALTER TABLE "crm_appointment_collaborators" ADD CONSTRAINT "crm_appointment_collaborators_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "crm_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_appointment_collaborators" ADD CONSTRAINT "crm_appointment_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "crm_contact_target_zones" ADD CONSTRAINT "crm_contact_target_zones_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_contact_target_zones" ADD CONSTRAINT "crm_contact_target_zones_commune_id_fkey" FOREIGN KEY ("commune_id") REFERENCES "communes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER TABLE "property_visit_collaborators" ADD CONSTRAINT "property_visit_collaborators_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "property_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visit_collaborators" ADD CONSTRAINT "property_visit_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_mandates" ADD CONSTRAINT "property_mandates_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regions" ADD CONSTRAINT "regions_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communes" ADD CONSTRAINT "communes_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_quality_scores" ADD CONSTRAINT "property_quality_scores_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_primary_renter_client_id_fkey" FOREIGN KEY ("primary_renter_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_owner_client_id_fkey" FOREIGN KEY ("owner_client_id") REFERENCES "tenant_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_leases" ADD CONSTRAINT "rental_leases_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_lease_co_renters" ADD CONSTRAINT "rental_lease_co_renters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_lease_co_renters" ADD CONSTRAINT "rental_lease_co_renters_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_lease_co_renters" ADD CONSTRAINT "rental_lease_co_renters_renter_client_id_fkey" FOREIGN KEY ("renter_client_id") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installments" ADD CONSTRAINT "rental_installments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installments" ADD CONSTRAINT "rental_installments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installments" ADD CONSTRAINT "rental_installments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installment_items" ADD CONSTRAINT "rental_installment_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_installment_items" ADD CONSTRAINT "rental_installment_items_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_renter_client_id_fkey" FOREIGN KEY ("renter_client_id") REFERENCES "tenant_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_allocations" ADD CONSTRAINT "rental_payment_allocations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_allocations" ADD CONSTRAINT "rental_payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payment_allocations" ADD CONSTRAINT "rental_payment_allocations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_refunds" ADD CONSTRAINT "rental_refunds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_refunds" ADD CONSTRAINT "rental_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_refunds" ADD CONSTRAINT "rental_refunds_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalty_rules" ADD CONSTRAINT "rental_penalty_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalties" ADD CONSTRAINT "rental_penalties_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalties" ADD CONSTRAINT "rental_penalties_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_penalties" ADD CONSTRAINT "rental_penalties_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_security_deposits" ADD CONSTRAINT "rental_security_deposits_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_security_deposits" ADD CONSTRAINT "rental_security_deposits_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_deposit_id_fkey" FOREIGN KEY ("deposit_id") REFERENCES "rental_security_deposits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_deposit_movements" ADD CONSTRAINT "rental_deposit_movements_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "rental_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "rental_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

