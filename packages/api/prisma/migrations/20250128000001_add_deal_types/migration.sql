-- AlterEnum
-- Add new values to CrmDealType enum
-- Note: ALTER TYPE ADD VALUE cannot be rolled back and must be executed separately
DO $$ BEGIN
    ALTER TYPE "CrmDealType" ADD VALUE 'VENTE';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "CrmDealType" ADD VALUE 'GESTION';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TYPE "CrmDealType" ADD VALUE 'MANDAT';
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

