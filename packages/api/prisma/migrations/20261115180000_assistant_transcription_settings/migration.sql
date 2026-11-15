ALTER TABLE "platform_ai_settings" ADD COLUMN "transcription" JSONB;
ALTER TABLE "assistant_provider_usage" ADD COLUMN "audio_seconds" INTEGER;
