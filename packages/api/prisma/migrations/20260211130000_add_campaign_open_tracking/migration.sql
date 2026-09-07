-- Add open tracking to newsletter campaign recipients
-- opened_at: when the recipient opened the email (tracking pixel)
-- open_token: unique token for the tracking pixel URL

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_campaign_recipients' AND column_name = 'opened_at'
  ) THEN
    ALTER TABLE "newsletter_campaign_recipients" ADD COLUMN "opened_at" TIMESTAMP(3);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'newsletter_campaign_recipients' AND column_name = 'open_token'
  ) THEN
    ALTER TABLE "newsletter_campaign_recipients" ADD COLUMN "open_token" TEXT;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "newsletter_campaign_recipients_open_token_key" ON "newsletter_campaign_recipients"("open_token") WHERE "open_token" IS NOT NULL;
