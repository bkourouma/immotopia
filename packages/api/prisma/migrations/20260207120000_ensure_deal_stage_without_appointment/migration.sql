-- When init runs after remove_appointment_stage (e.g. shadow DB), CrmDealStage still has APPOINTMENT.
-- This migration removes APPOINTMENT from the enum if present, so the final schema matches schema.prisma.
DO $$
DECLARE
  has_appointment boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'CrmDealStage' AND e.enumlabel = 'APPOINTMENT'
  ) INTO has_appointment;

  IF has_appointment THEN
    UPDATE crm_deals SET stage = 'VISIT' WHERE stage = 'APPOINTMENT';

    CREATE TYPE "CrmDealStage_new" AS ENUM ('NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'WON', 'LOST');

    ALTER TABLE "crm_deals" ALTER COLUMN "stage" DROP DEFAULT;
    ALTER TABLE "crm_deals" ALTER COLUMN "stage" TYPE "CrmDealStage_new" USING ("stage"::text::"CrmDealStage_new");
    ALTER TABLE "crm_deals" ALTER COLUMN "stage" SET DEFAULT 'NEW'::"CrmDealStage_new";

    DROP TYPE "CrmDealStage";
    ALTER TYPE "CrmDealStage_new" RENAME TO "CrmDealStage";
  END IF;
END $$;

-- 2) Drop appointment tables and enums if present (init may have created them after remove_appointments)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_appointments') THEN
    ALTER TABLE "crm_appointment_collaborators" DROP CONSTRAINT IF EXISTS "crm_appointment_collaborators_appointment_id_fkey";
    ALTER TABLE "crm_appointment_collaborators" DROP CONSTRAINT IF EXISTS "crm_appointment_collaborators_user_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_tenant_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_contact_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_deal_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_created_by_user_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_assigned_to_user_id_fkey";

    DROP TABLE IF EXISTS "crm_appointment_collaborators";
    DROP TABLE IF EXISTS "crm_appointments";

    DROP TYPE IF EXISTS "CrmAppointmentStatus";
    DROP TYPE IF EXISTS "CrmAppointmentType";
  END IF;
END $$;

-- 3) Create payment declarations table and enum if missing (add_payment_declarations ran before init on shadow DB)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_leases')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_payment_declarations') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentDeclarationStatus') THEN
      CREATE TYPE "PaymentDeclarationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
    END IF;

    CREATE TABLE "rental_payment_declarations" (
      "id" UUID NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "lease_id" UUID NOT NULL,
      "installment_id" UUID,
      "declared_by" TEXT NOT NULL,
      "amount" DECIMAL(12,2) NOT NULL,
      "payment_date" TIMESTAMP(3) NOT NULL,
      "payment_method" "RentalPaymentMethod" NOT NULL,
      "mobile_operator" "MobileMoneyOperator",
      "reference" TEXT,
      "transaction_phone" TEXT,
      "proof_file_url" TEXT,
      "status" "PaymentDeclarationStatus" NOT NULL DEFAULT 'PENDING',
      "reviewed_by" TEXT,
      "reviewed_at" TIMESTAMP(3),
      "review_notes" TEXT,
      "notes" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "rental_payment_declarations_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX "rental_payment_declarations_tenant_id_idx" ON "rental_payment_declarations"("tenant_id");
    CREATE INDEX "rental_payment_declarations_lease_id_idx" ON "rental_payment_declarations"("lease_id");
    CREATE INDEX "rental_payment_declarations_declared_by_idx" ON "rental_payment_declarations"("declared_by");
    CREATE INDEX "rental_payment_declarations_status_idx" ON "rental_payment_declarations"("status");
    CREATE INDEX "rental_payment_declarations_installment_id_idx" ON "rental_payment_declarations"("installment_id");

    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 4) Create maintenance module if missing (add_maintenance_module ran before init on shadow DB)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants')
     AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'maintenance_tickets') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaintenanceTicketCategory') THEN
      CREATE TYPE "MaintenanceTicketCategory" AS ENUM ('PLUMBING', 'ELECTRICITY', 'AC', 'OTHER');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaintenanceTicketPriority') THEN
      CREATE TYPE "MaintenanceTicketPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaintenanceTicketStatus') THEN
      CREATE TYPE "MaintenanceTicketStatus" AS ENUM ('DECLARED', 'IN_PROGRESS', 'ASSIGNED', 'RESOLVED', 'CANCELED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'MaintenanceTicketCommentAuthorType') THEN
      CREATE TYPE "MaintenanceTicketCommentAuthorType" AS ENUM ('TENANT', 'MANAGER', 'SYSTEM');
    END IF;

    CREATE TABLE "maintenance_vendors" (
      "id" UUID NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "phone" VARCHAR(50),
      "email" VARCHAR(255),
      "address" TEXT,
      "specialties" TEXT[] DEFAULT ARRAY[]::TEXT[],
      "is_active" BOOLEAN NOT NULL DEFAULT true,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "maintenance_vendors_pkey" PRIMARY KEY ("id")
    );
    CREATE TABLE "maintenance_tickets" (
      "id" UUID NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "property_id" TEXT NOT NULL,
      "lease_id" UUID,
      "tenant_contact_id" TEXT,
      "created_by_user_id" TEXT,
      "created_by_contact_id" TEXT,
      "title" TEXT NOT NULL,
      "category" "MaintenanceTicketCategory" NOT NULL,
      "priority" "MaintenanceTicketPriority" NOT NULL,
      "description" TEXT NOT NULL,
      "location_details" TEXT,
      "status" "MaintenanceTicketStatus" NOT NULL DEFAULT 'DECLARED',
      "assigned_vendor_id" UUID,
      "assigned_to_user_id" TEXT,
      "resolution_notes" TEXT,
      "declared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "in_progress_at" TIMESTAMP(3),
      "assigned_at" TIMESTAMP(3),
      "resolved_at" TIMESTAMP(3),
      "canceled_at" TIMESTAMP(3),
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updated_at" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "maintenance_tickets_pkey" PRIMARY KEY ("id")
    );
    CREATE TABLE "maintenance_ticket_attachments" (
      "id" UUID NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "ticket_id" UUID NOT NULL,
      "file_url" TEXT NOT NULL,
      "file_name" TEXT NOT NULL,
      "mime_type" TEXT NOT NULL,
      "file_size" INTEGER NOT NULL,
      "uploaded_by_user_id" TEXT,
      "uploaded_by_contact_id" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "maintenance_ticket_attachments_pkey" PRIMARY KEY ("id")
    );
    CREATE TABLE "maintenance_ticket_comments" (
      "id" UUID NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "ticket_id" UUID NOT NULL,
      "author_type" "MaintenanceTicketCommentAuthorType" NOT NULL,
      "content" TEXT NOT NULL,
      "author_user_id" TEXT,
      "author_contact_id" TEXT,
      "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "maintenance_ticket_comments_pkey" PRIMARY KEY ("id")
    );
    CREATE TABLE "maintenance_ticket_status_history" (
      "id" UUID NOT NULL,
      "tenant_id" TEXT NOT NULL,
      "ticket_id" UUID NOT NULL,
      "from_status" "MaintenanceTicketStatus",
      "to_status" "MaintenanceTicketStatus" NOT NULL,
      "note" TEXT,
      "changed_by_user_id" TEXT,
      "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "maintenance_ticket_status_history_pkey" PRIMARY KEY ("id")
    );

    CREATE INDEX "maintenance_vendors_tenant_id_idx" ON "maintenance_vendors"("tenant_id");
    CREATE INDEX "maintenance_vendors_tenant_id_is_active_idx" ON "maintenance_vendors"("tenant_id", "is_active");
    CREATE INDEX "maintenance_vendors_tenant_id_name_idx" ON "maintenance_vendors"("tenant_id", "name");
    CREATE INDEX "maintenance_tickets_tenant_id_idx" ON "maintenance_tickets"("tenant_id");
    CREATE INDEX "maintenance_tickets_tenant_id_status_idx" ON "maintenance_tickets"("tenant_id", "status");
    CREATE INDEX "maintenance_tickets_tenant_id_property_id_idx" ON "maintenance_tickets"("tenant_id", "property_id");
    CREATE INDEX "maintenance_tickets_tenant_id_lease_id_idx" ON "maintenance_tickets"("tenant_id", "lease_id");
    CREATE INDEX "maintenance_tickets_tenant_id_assigned_vendor_id_idx" ON "maintenance_tickets"("tenant_id", "assigned_vendor_id");
    CREATE INDEX "maintenance_tickets_tenant_id_created_at_idx" ON "maintenance_tickets"("tenant_id", "created_at");
    CREATE INDEX "maintenance_tickets_property_id_idx" ON "maintenance_tickets"("property_id");
    CREATE INDEX "maintenance_tickets_lease_id_idx" ON "maintenance_tickets"("lease_id");
    CREATE INDEX "maintenance_ticket_attachments_tenant_id_idx" ON "maintenance_ticket_attachments"("tenant_id");
    CREATE INDEX "maintenance_ticket_attachments_tenant_id_ticket_id_idx" ON "maintenance_ticket_attachments"("tenant_id", "ticket_id");
    CREATE INDEX "maintenance_ticket_attachments_ticket_id_idx" ON "maintenance_ticket_attachments"("ticket_id");
    CREATE INDEX "maintenance_ticket_comments_tenant_id_idx" ON "maintenance_ticket_comments"("tenant_id");
    CREATE INDEX "maintenance_ticket_comments_tenant_id_ticket_id_idx" ON "maintenance_ticket_comments"("tenant_id", "ticket_id");
    CREATE INDEX "maintenance_ticket_comments_ticket_id_idx" ON "maintenance_ticket_comments"("ticket_id");
    CREATE INDEX "maintenance_ticket_comments_created_at_idx" ON "maintenance_ticket_comments"("created_at");
    CREATE INDEX "maintenance_ticket_status_history_tenant_id_idx" ON "maintenance_ticket_status_history"("tenant_id");
    CREATE INDEX "maintenance_ticket_status_history_tenant_id_ticket_id_idx" ON "maintenance_ticket_status_history"("tenant_id", "ticket_id");
    CREATE INDEX "maintenance_ticket_status_history_ticket_id_idx" ON "maintenance_ticket_status_history"("ticket_id");
    CREATE INDEX "maintenance_ticket_status_history_changed_at_idx" ON "maintenance_ticket_status_history"("changed_at");

    ALTER TABLE "maintenance_vendors" ADD CONSTRAINT "maintenance_vendors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenant_contact_id_fkey" FOREIGN KEY ("tenant_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_contact_id_fkey" FOREIGN KEY ("created_by_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_vendor_id_fkey" FOREIGN KEY ("assigned_vendor_id") REFERENCES "maintenance_vendors"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_uploaded_by_contact_id_fkey" FOREIGN KEY ("uploaded_by_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_author_contact_id_fkey" FOREIGN KEY ("author_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_status_history" ADD CONSTRAINT "maintenance_ticket_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_status_history" ADD CONSTRAINT "maintenance_ticket_status_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_status_history" ADD CONSTRAINT "maintenance_ticket_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END $$;
