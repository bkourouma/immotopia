/**
 * Script to safely add owner portal fields to tenant_clients table
 * This script checks if columns exist before creating them
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🔄 Adding owner portal fields to tenant_clients table...');

  try {
    // Check if columns already exist
    const columnsExist = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'tenant_clients' 
      AND column_name IN ('owner_portal_enabled', 'owner_portal_last_access');
    `);

    const existingColumns = Array.isArray(columnsExist) 
      ? columnsExist.map((row: any) => row.column_name)
      : [];

    // Add owner_portal_enabled column if it doesn't exist
    if (!existingColumns.includes('owner_portal_enabled')) {
      console.log('📝 Adding owner_portal_enabled column...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "tenant_clients" 
        ADD COLUMN IF NOT EXISTS "owner_portal_enabled" BOOLEAN NOT NULL DEFAULT false;
      `);
      console.log('✅ Column owner_portal_enabled added');
    } else {
      console.log('ℹ️  Column owner_portal_enabled already exists');
    }

    // Add owner_portal_last_access column if it doesn't exist
    if (!existingColumns.includes('owner_portal_last_access')) {
      console.log('📝 Adding owner_portal_last_access column...');
      await prisma.$executeRawUnsafe(`
        ALTER TABLE "tenant_clients" 
        ADD COLUMN IF NOT EXISTS "owner_portal_last_access" TIMESTAMP(3);
      `);
      console.log('✅ Column owner_portal_last_access added');
    } else {
      console.log('ℹ️  Column owner_portal_last_access already exists');
    }

    // Verify the columns exist
    const verifyColumns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
      AND table_name = 'tenant_clients' 
      AND column_name IN ('owner_portal_enabled', 'owner_portal_last_access');
    `);

    console.log('\n📊 Verification:');
    if (Array.isArray(verifyColumns) && verifyColumns.length > 0) {
      verifyColumns.forEach((col: any) => {
        console.log(`  ✅ ${col.column_name}: ${col.data_type} (nullable: ${col.is_nullable}, default: ${col.column_default || 'none'})`);
      });
    }

    console.log('\n✅ Owner portal fields migration completed successfully!');
  } catch (error: any) {
    console.error('❌ Error adding owner portal fields:', error.message);
    console.error('\n📝 You can run the SQL manually:');
    console.log(`
      ALTER TABLE "tenant_clients" 
      ADD COLUMN IF NOT EXISTS "owner_portal_enabled" BOOLEAN NOT NULL DEFAULT false;

      ALTER TABLE "tenant_clients" 
      ADD COLUMN IF NOT EXISTS "owner_portal_last_access" TIMESTAMP(3);
    `);
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
