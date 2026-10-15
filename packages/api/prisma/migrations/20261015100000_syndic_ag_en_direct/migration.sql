-- Spec 043 : assemblee generale en direct (presences, vote ouvert/clos par resolution, liens personnels).

-- CreateEnum
CREATE TYPE "GMResolutionVoteStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "GMVoteSource" AS ENUM ('MANAGER', 'CO_OWNER', 'PROXY_HOLDER');

-- CreateEnum
CREATE TYPE "GMAttendanceStatus" AS ENUM ('PRESENT', 'REPRESENTED', 'ABSENT');

-- CreateEnum
CREATE TYPE "GMAttendanceMode" AS ENUM ('ONLINE', 'IN_PERSON');

-- CreateEnum
CREATE TYPE "GMAttendanceRecorder" AS ENUM ('SELF', 'MANAGER');

-- AlterEnum
ALTER TYPE "SecureLinkScope" ADD VALUE 'GENERAL_MEETING_ACCESS';

-- AlterTable
ALTER TABLE "general_meetings" ADD COLUMN     "video_conference_url" TEXT;

-- AlterTable
ALTER TABLE "gm_resolutions" ADD COLUMN     "vote_closed_at" TIMESTAMP(3),
ADD COLUMN     "vote_opened_at" TIMESTAMP(3),
ADD COLUMN     "vote_status" "GMResolutionVoteStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "gm_votes" ADD COLUMN     "cast_by_contact_id" TEXT,
ADD COLUMN     "cast_by_user_id" TEXT,
ADD COLUMN     "source" "GMVoteSource" NOT NULL DEFAULT 'MANAGER',
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "gm_participants" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "meeting_id" UUID NOT NULL,
    "contact_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gm_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gm_attendances" (
    "id" UUID NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "meeting_id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "status" "GMAttendanceStatus" NOT NULL,
    "mode" "GMAttendanceMode" NOT NULL,
    "attendee_contact_id" TEXT,
    "represented_by_contact_id" TEXT,
    "recorded_by" "GMAttendanceRecorder" NOT NULL,
    "recorded_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "gm_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "gm_participants_tenant_id_idx" ON "gm_participants"("tenant_id");

-- CreateIndex
CREATE INDEX "gm_participants_contact_id_idx" ON "gm_participants"("contact_id");

-- CreateIndex
CREATE UNIQUE INDEX "gm_participants_meeting_id_contact_id_key" ON "gm_participants"("meeting_id", "contact_id");

-- CreateIndex
CREATE INDEX "gm_attendances_tenant_id_idx" ON "gm_attendances"("tenant_id");

-- CreateIndex
CREATE INDEX "gm_attendances_lot_id_idx" ON "gm_attendances"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "gm_attendances_meeting_id_lot_id_key" ON "gm_attendances"("meeting_id", "lot_id");

-- AddForeignKey
ALTER TABLE "gm_participants" ADD CONSTRAINT "gm_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_participants" ADD CONSTRAINT "gm_participants_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_participants" ADD CONSTRAINT "gm_participants_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_attendances" ADD CONSTRAINT "gm_attendances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_attendances" ADD CONSTRAINT "gm_attendances_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gm_attendances" ADD CONSTRAINT "gm_attendances_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "syndicate_lots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Donnees existantes : les votes deja saisis gardent leur date comme derniere modification,
-- et les resolutions des AG deja tenues sont closes (valeurs par defaut : voteStatus PENDING,
-- source MANAGER pour les autres lignes).
UPDATE "gm_votes" SET "updated_at" = "created_at";

UPDATE "gm_resolutions" r
SET "vote_status" = 'CLOSED',
    "vote_closed_at" = COALESCE(m."end_time", m."scheduled_at")
FROM "general_meetings" m
WHERE r."meeting_id" = m."id" AND m."status" = 'COMPLETED';
