-- CreateEnum
CREATE TYPE "GMMediaPolicy" AS ENUM ('DEFAULT', 'ALLOWED', 'BLOCKED');

-- AlterTable
ALTER TABLE "general_meetings" ADD COLUMN     "media_locked_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "gm_participants" ADD COLUMN     "media_policy" "GMMediaPolicy" NOT NULL DEFAULT 'DEFAULT';
