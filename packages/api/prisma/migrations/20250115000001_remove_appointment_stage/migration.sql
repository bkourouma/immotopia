-- Remove APPOINTMENT stage from CrmDealStage enum (only when crm_deals exists, so migration order is safe on shadow DB)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_deals') THEN
    UPDATE crm_deals SET stage = 'VISIT' WHERE stage = 'APPOINTMENT';

    CREATE TYPE "CrmDealStage_new" AS ENUM ('NEW', 'QUALIFIED', 'VISIT', 'NEGOTIATION', 'WON', 'LOST');

    ALTER TABLE "crm_deals" ALTER COLUMN "stage" DROP DEFAULT;
    ALTER TABLE "crm_deals" ALTER COLUMN "stage" TYPE "CrmDealStage_new" USING ("stage"::text::"CrmDealStage_new");
    ALTER TABLE "crm_deals" ALTER COLUMN "stage" SET DEFAULT 'NEW'::"CrmDealStage_new";

    DROP TYPE "CrmDealStage";
    ALTER TYPE "CrmDealStage_new" RENAME TO "CrmDealStage";
  END IF;
END $$;
