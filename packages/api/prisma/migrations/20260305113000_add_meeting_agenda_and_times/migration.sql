ALTER TABLE "general_meetings"
  ADD COLUMN "start_time" TIMESTAMP(3),
  ADD COLUMN "end_time" TIMESTAMP(3);

CREATE TABLE "gm_agenda_items" (
  "id" UUID NOT NULL,
  "meeting_id" UUID NOT NULL,
  "order_index" INTEGER NOT NULL DEFAULT 1,
  "title" TEXT NOT NULL,
  "discussions" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "gm_agenda_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "gm_agenda_items_meeting_id_idx" ON "gm_agenda_items"("meeting_id");
CREATE INDEX "gm_agenda_items_meeting_id_order_index_idx" ON "gm_agenda_items"("meeting_id", "order_index");

ALTER TABLE "gm_agenda_items"
  ADD CONSTRAINT "gm_agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "general_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
