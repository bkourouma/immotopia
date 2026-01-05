-- CreateTable
CREATE TABLE "crm_appointment_collaborators" (
    "id" TEXT NOT NULL,
    "appointment_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_appointment_collaborators_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_appointment_collaborators_appointment_id_idx" ON "crm_appointment_collaborators"("appointment_id");

-- CreateIndex
CREATE INDEX "crm_appointment_collaborators_user_id_idx" ON "crm_appointment_collaborators"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "crm_appointment_collaborators_appointment_id_user_id_key" ON "crm_appointment_collaborators"("appointment_id", "user_id");

-- AddForeignKey
ALTER TABLE "crm_appointment_collaborators" ADD CONSTRAINT "crm_appointment_collaborators_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "crm_appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_appointment_collaborators" ADD CONSTRAINT "crm_appointment_collaborators_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
