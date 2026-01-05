-- CreateTable
CREATE TABLE "property_visit_collaborators" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_visit_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "property_visit_collaborators_visit_id_idx" ON "property_visit_collaborators"("visit_id");

-- CreateIndex
CREATE INDEX "property_visit_collaborators_user_id_idx" ON "property_visit_collaborators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "property_visit_collaborators_visit_id_user_id_key" ON "property_visit_collaborators"("visit_id", "user_id");

-- AddForeignKey
ALTER TABLE "property_visit_collaborators" ADD CONSTRAINT "property_visit_collaborators_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "property_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_visit_collaborators" ADD CONSTRAINT "property_visit_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
