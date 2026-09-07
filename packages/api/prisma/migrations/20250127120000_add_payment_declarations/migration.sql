-- Only run when dependencies exist (rental_leases, enums from init); no-op on shadow DB when run before init.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_leases') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentDeclarationStatus') THEN
      CREATE TYPE "PaymentDeclarationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
    END IF;

    CREATE TABLE IF NOT EXISTS "rental_payment_declarations" (
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

    CREATE INDEX IF NOT EXISTS "rental_payment_declarations_tenant_id_idx" ON "rental_payment_declarations"("tenant_id");
    CREATE INDEX IF NOT EXISTS "rental_payment_declarations_lease_id_idx" ON "rental_payment_declarations"("lease_id");
    CREATE INDEX IF NOT EXISTS "rental_payment_declarations_declared_by_idx" ON "rental_payment_declarations"("declared_by");
    CREATE INDEX IF NOT EXISTS "rental_payment_declarations_status_idx" ON "rental_payment_declarations"("status");
    CREATE INDEX IF NOT EXISTS "rental_payment_declarations_installment_id_idx" ON "rental_payment_declarations"("installment_id");

    ALTER TABLE "rental_payment_declarations" DROP CONSTRAINT IF EXISTS "rental_payment_declarations_lease_id_fkey";
    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_lease_id_fkey" FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    ALTER TABLE "rental_payment_declarations" DROP CONSTRAINT IF EXISTS "rental_payment_declarations_installment_id_fkey";
    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_installment_id_fkey" FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

    ALTER TABLE "rental_payment_declarations" DROP CONSTRAINT IF EXISTS "rental_payment_declarations_declared_by_fkey";
    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

    ALTER TABLE "rental_payment_declarations" DROP CONSTRAINT IF EXISTS "rental_payment_declarations_reviewed_by_fkey";
    ALTER TABLE "rental_payment_declarations" ADD CONSTRAINT "rental_payment_declarations_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
