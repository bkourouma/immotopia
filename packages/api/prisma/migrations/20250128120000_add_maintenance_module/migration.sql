-- Only run when dependencies exist (tenants, properties, etc. from init); no-op on shadow DB when run before init.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
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

    CREATE TABLE IF NOT EXISTS "maintenance_vendors" (
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

    CREATE TABLE IF NOT EXISTS "maintenance_tickets" (
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

    CREATE TABLE IF NOT EXISTS "maintenance_ticket_attachments" (
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

    CREATE TABLE IF NOT EXISTS "maintenance_ticket_comments" (
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

    CREATE TABLE IF NOT EXISTS "maintenance_ticket_status_history" (
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

    CREATE INDEX IF NOT EXISTS "maintenance_vendors_tenant_id_idx" ON "maintenance_vendors"("tenant_id");
    CREATE INDEX IF NOT EXISTS "maintenance_vendors_tenant_id_is_active_idx" ON "maintenance_vendors"("tenant_id", "is_active");
    CREATE INDEX IF NOT EXISTS "maintenance_vendors_tenant_id_name_idx" ON "maintenance_vendors"("tenant_id", "name");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_tenant_id_idx" ON "maintenance_tickets"("tenant_id");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_tenant_id_status_idx" ON "maintenance_tickets"("tenant_id", "status");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_tenant_id_property_id_idx" ON "maintenance_tickets"("tenant_id", "property_id");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_tenant_id_lease_id_idx" ON "maintenance_tickets"("tenant_id", "lease_id");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_tenant_id_assigned_vendor_id_idx" ON "maintenance_tickets"("tenant_id", "assigned_vendor_id");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_tenant_id_created_at_idx" ON "maintenance_tickets"("tenant_id", "created_at");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_property_id_idx" ON "maintenance_tickets"("property_id");
    CREATE INDEX IF NOT EXISTS "maintenance_tickets_lease_id_idx" ON "maintenance_tickets"("lease_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_attachments_tenant_id_idx" ON "maintenance_ticket_attachments"("tenant_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_attachments_tenant_id_ticket_id_idx" ON "maintenance_ticket_attachments"("tenant_id", "ticket_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_attachments_ticket_id_idx" ON "maintenance_ticket_attachments"("ticket_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_comments_tenant_id_idx" ON "maintenance_ticket_comments"("tenant_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_comments_tenant_id_ticket_id_idx" ON "maintenance_ticket_comments"("tenant_id", "ticket_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_comments_ticket_id_idx" ON "maintenance_ticket_comments"("ticket_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_comments_created_at_idx" ON "maintenance_ticket_comments"("created_at");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_status_history_tenant_id_idx" ON "maintenance_ticket_status_history"("tenant_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_status_history_tenant_id_ticket_id_idx" ON "maintenance_ticket_status_history"("tenant_id", "ticket_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_status_history_ticket_id_idx" ON "maintenance_ticket_status_history"("ticket_id");
    CREATE INDEX IF NOT EXISTS "maintenance_ticket_status_history_changed_at_idx" ON "maintenance_ticket_status_history"("changed_at");

    ALTER TABLE "maintenance_vendors" DROP CONSTRAINT IF EXISTS "maintenance_vendors_tenant_id_fkey";
    ALTER TABLE "maintenance_vendors" ADD CONSTRAINT "maintenance_vendors_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_tenant_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_property_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_lease_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_tenant_contact_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_tenant_contact_id_fkey" FOREIGN KEY ("tenant_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_created_by_user_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_created_by_contact_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_created_by_contact_id_fkey" FOREIGN KEY ("created_by_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_assigned_vendor_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_vendor_id_fkey" FOREIGN KEY ("assigned_vendor_id") REFERENCES "maintenance_vendors"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_tickets" DROP CONSTRAINT IF EXISTS "maintenance_tickets_assigned_to_user_id_fkey";
    ALTER TABLE "maintenance_tickets" ADD CONSTRAINT "maintenance_tickets_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

    ALTER TABLE "maintenance_ticket_attachments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_attachments_tenant_id_fkey";
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_attachments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_attachments_ticket_id_fkey";
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_attachments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_attachments_uploaded_by_user_id_fkey";
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_attachments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_attachments_uploaded_by_contact_id_fkey";
    ALTER TABLE "maintenance_ticket_attachments" ADD CONSTRAINT "maintenance_ticket_attachments_uploaded_by_contact_id_fkey" FOREIGN KEY ("uploaded_by_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

    ALTER TABLE "maintenance_ticket_comments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_comments_tenant_id_fkey";
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_comments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_comments_ticket_id_fkey";
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_comments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_comments_author_user_id_fkey";
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_author_user_id_fkey" FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_comments" DROP CONSTRAINT IF EXISTS "maintenance_ticket_comments_author_contact_id_fkey";
    ALTER TABLE "maintenance_ticket_comments" ADD CONSTRAINT "maintenance_ticket_comments_author_contact_id_fkey" FOREIGN KEY ("author_contact_id") REFERENCES "crm_contacts"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

    ALTER TABLE "maintenance_ticket_status_history" DROP CONSTRAINT IF EXISTS "maintenance_ticket_status_history_tenant_id_fkey";
    ALTER TABLE "maintenance_ticket_status_history" ADD CONSTRAINT "maintenance_ticket_status_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_status_history" DROP CONSTRAINT IF EXISTS "maintenance_ticket_status_history_ticket_id_fkey";
    ALTER TABLE "maintenance_ticket_status_history" ADD CONSTRAINT "maintenance_ticket_status_history_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "maintenance_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "maintenance_ticket_status_history" DROP CONSTRAINT IF EXISTS "maintenance_ticket_status_history_changed_by_user_id_fkey";
    ALTER TABLE "maintenance_ticket_status_history" ADD CONSTRAINT "maintenance_ticket_status_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE CASCADE;
  END IF;
END $$;
