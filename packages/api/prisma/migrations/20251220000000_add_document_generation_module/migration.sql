-- CreateEnum: DocumentTemplateStatus (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentTemplateStatus') THEN
        CREATE TYPE "DocumentTemplateStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'DELETED');
    END IF;
END $$;

-- CreateEnum: DocumentType (only if it doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DocumentType') THEN
        CREATE TYPE "DocumentType" AS ENUM ('LEASE_HABITATION', 'LEASE_COMMERCIAL', 'RENT_RECEIPT', 'RENT_STATEMENT');
    END IF;
END $$;

-- AlterEnum: Add SUPERSEDED value to RentalDocumentStatus
-- Note: RentalDocumentStatus enum exists from rental_management migration (20251219081244)
-- We check if the value exists before adding it to avoid errors on re-run
DO $$ 
BEGIN
    -- Check if the enum value 'SUPERSEDED' already exists
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_enum 
        WHERE enumlabel = 'SUPERSEDED' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'RentalDocumentStatus')
    ) THEN
        -- Value doesn't exist, add it
        ALTER TYPE "RentalDocumentStatus" ADD VALUE 'SUPERSEDED';
    END IF;
END $$;

-- AlterTable: Add columns to rental_documents if table exists
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_documents') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rental_documents' AND column_name = 'file_path') THEN
            ALTER TABLE "rental_documents" ADD COLUMN "file_path" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rental_documents' AND column_name = 'file_hash') THEN
            ALTER TABLE "rental_documents" ADD COLUMN "file_hash" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rental_documents' AND column_name = 'template_id') THEN
            ALTER TABLE "rental_documents" ADD COLUMN "template_id" UUID;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rental_documents' AND column_name = 'template_hash') THEN
            ALTER TABLE "rental_documents" ADD COLUMN "template_hash" TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rental_documents' AND column_name = 'revision') THEN
            ALTER TABLE "rental_documents" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rental_documents' AND column_name = 'superseded_by_id') THEN
            ALTER TABLE "rental_documents" ADD COLUMN "superseded_by_id" UUID;
        END IF;
    END IF;
END $$;

-- CreateTable: Only if it doesn't exist
CREATE TABLE IF NOT EXISTS "document_templates" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT,
    "doc_type" "DocumentType" NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "status" "DocumentTemplateStatus" NOT NULL DEFAULT 'INACTIVE',
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "original_filename" VARCHAR(255) NOT NULL,
    "stored_filename" VARCHAR(255) NOT NULL,
    "storage_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "file_hash_sha256" VARCHAR(64) NOT NULL,
    "placeholders" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Only if it doesn't exist
CREATE TABLE IF NOT EXISTS "document_counters" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "doc_type" "DocumentType" NOT NULL,
    "period_key" VARCHAR(20) NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_counters_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Only if they don't exist
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_templates') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_templates_tenant_id_idx') THEN
            CREATE INDEX "document_templates_tenant_id_idx" ON "document_templates"("tenant_id");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_templates_tenant_id_doc_type_idx') THEN
            CREATE INDEX "document_templates_tenant_id_doc_type_idx" ON "document_templates"("tenant_id", "doc_type");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_templates_tenant_id_doc_type_status_idx') THEN
            CREATE INDEX "document_templates_tenant_id_doc_type_status_idx" ON "document_templates"("tenant_id", "doc_type", "status");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_templates_status_idx') THEN
            CREATE INDEX "document_templates_status_idx" ON "document_templates"("status");
        END IF;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_counters') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_counters_tenant_id_idx') THEN
            CREATE INDEX "document_counters_tenant_id_idx" ON "document_counters"("tenant_id");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_counters_tenant_id_doc_type_idx') THEN
            CREATE INDEX "document_counters_tenant_id_doc_type_idx" ON "document_counters"("tenant_id", "doc_type");
        END IF;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_documents') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'rental_documents_template_id_idx') THEN
            CREATE INDEX "rental_documents_template_id_idx" ON "rental_documents"("template_id");
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'rental_documents_superseded_by_id_idx') THEN
            CREATE INDEX "rental_documents_superseded_by_id_idx" ON "rental_documents"("superseded_by_id");
        END IF;
    END IF;
END $$;

-- CreateUniqueConstraint: Only if they don't exist
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_templates') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_templates_tenant_id_doc_type_is_default_key') THEN
            CREATE UNIQUE INDEX "document_templates_tenant_id_doc_type_is_default_key" ON "document_templates"("tenant_id", "doc_type", "is_default") WHERE "is_default" = true;
        END IF;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_counters') THEN
        IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'document_counters_tenant_id_doc_type_period_key_key') THEN
            CREATE UNIQUE INDEX "document_counters_tenant_id_doc_type_period_key_key" ON "document_counters"("tenant_id", "doc_type", "period_key");
        END IF;
    END IF;
END $$;

-- AddForeignKey: Only if tables and constraints don't exist
DO $$ 
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_templates') THEN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'document_templates_tenant_id_fkey') THEN
                ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
        END IF;
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'users') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'document_templates_created_by_user_id_fkey') THEN
                ALTER TABLE "document_templates" ADD CONSTRAINT "document_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
            END IF;
        END IF;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_counters') THEN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'tenants') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'document_counters_tenant_id_fkey') THEN
                ALTER TABLE "document_counters" ADD CONSTRAINT "document_counters_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
            END IF;
        END IF;
    END IF;
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_documents') THEN
        IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'document_templates') THEN
            IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'rental_documents_template_id_fkey') THEN
                ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'rental_documents_superseded_by_id_fkey') THEN
            ALTER TABLE "rental_documents" ADD CONSTRAINT "rental_documents_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "rental_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
        END IF;
    END IF;
END $$;

