ALTER TABLE "users" ADD COLUMN "preferred_assistant_language" TEXT;

ALTER TABLE "users" ADD CONSTRAINT "users_assistant_language_check"
  CHECK ("preferred_assistant_language" IN ('fr', 'en', 'ar', 'es', 'zh', 'hi'));
