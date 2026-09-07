/**
 * Script to safely apply the payment declarations migration
 * This script checks if objects exist before creating them
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Applying payment declarations migration...');

  try {
    // Execute migration steps one by one
    
    // 1. Create enum if it doesn't exist
    console.log('📝 Creating PaymentDeclarationStatus enum...');
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PaymentDeclarationStatus') THEN
              CREATE TYPE "PaymentDeclarationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');
          END IF;
      END $$;
    `);

    // 2. Create table if it doesn't exist
    console.log('📝 Creating rental_payment_declarations table...');
    await prisma.$executeRawUnsafe(`
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
    `);

    // 3. Create indexes if they don't exist
    console.log('📝 Creating indexes...');
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payment_declarations_tenant_id_idx" ON "rental_payment_declarations"("tenant_id");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payment_declarations_lease_id_idx" ON "rental_payment_declarations"("lease_id");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payment_declarations_declared_by_idx" ON "rental_payment_declarations"("declared_by");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payment_declarations_status_idx" ON "rental_payment_declarations"("status");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "rental_payment_declarations_installment_id_idx" ON "rental_payment_declarations"("installment_id");`);

    // 4. Add foreign keys if they don't exist
    console.log('📝 Adding foreign keys...');
    await prisma.$executeRawUnsafe(`
      DO $$ 
      BEGIN
          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'rental_payment_declarations_lease_id_fkey'
          ) THEN
              ALTER TABLE "rental_payment_declarations" 
              ADD CONSTRAINT "rental_payment_declarations_lease_id_fkey" 
              FOREIGN KEY ("lease_id") REFERENCES "rental_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'rental_payment_declarations_installment_id_fkey'
          ) THEN
              ALTER TABLE "rental_payment_declarations" 
              ADD CONSTRAINT "rental_payment_declarations_installment_id_fkey" 
              FOREIGN KEY ("installment_id") REFERENCES "rental_installments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'rental_payment_declarations_declared_by_fkey'
          ) THEN
              ALTER TABLE "rental_payment_declarations" 
              ADD CONSTRAINT "rental_payment_declarations_declared_by_fkey" 
              FOREIGN KEY ("declared_by") REFERENCES "tenant_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
          END IF;

          IF NOT EXISTS (
              SELECT 1 FROM pg_constraint 
              WHERE conname = 'rental_payment_declarations_reviewed_by_fkey'
          ) THEN
              ALTER TABLE "rental_payment_declarations" 
              ADD CONSTRAINT "rental_payment_declarations_reviewed_by_fkey" 
              FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
          END IF;
      END $$;
    `);

    console.log('✅ Payment declarations migration applied successfully!');

    // Verify the table exists
    const tableExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'rental_payment_declarations'
      );
    `);

    if (Array.isArray(tableExists) && tableExists[0] && (tableExists[0] as any).exists) {
      console.log('✅ Table rental_payment_declarations verified');
    } else {
      console.log('⚠️  Table rental_payment_declarations may not exist');
    }

    // Verify the enum exists
    const enumExists = await prisma.$queryRawUnsafe(`
      SELECT EXISTS (
        SELECT FROM pg_type 
        WHERE typname = 'PaymentDeclarationStatus'
      );
    `);

    if (Array.isArray(enumExists) && enumExists[0] && (enumExists[0] as any).exists) {
      console.log('✅ Enum PaymentDeclarationStatus verified');
    } else {
      console.log('⚠️  Enum PaymentDeclarationStatus may not exist');
    }
  } catch (error: any) {
    console.error('❌ Error applying migration:', error.message);
    console.error('\n📝 Please run the SQL manually from:');
    console.log('packages/api/prisma/migrations/20250127120000_add_payment_declarations/migration_safe.sql');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main()
  .catch((error) => {
    console.error('❌ Script failed:', error);
    process.exit(1);
  });
