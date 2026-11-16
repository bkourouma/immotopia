ALTER TABLE "platform_ai_settings" ADD COLUMN "models_by_mode" JSONB NOT NULL DEFAULT '{}'::jsonb;
