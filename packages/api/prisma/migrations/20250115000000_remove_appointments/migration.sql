-- Remove appointment tables and enums (only when tables exist, so migration order is safe on shadow DB)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'crm_appointments') THEN
    ALTER TABLE "crm_appointment_collaborators" DROP CONSTRAINT IF EXISTS "crm_appointment_collaborators_appointment_id_fkey";
    ALTER TABLE "crm_appointment_collaborators" DROP CONSTRAINT IF EXISTS "crm_appointment_collaborators_user_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_tenant_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_contact_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_deal_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_created_by_user_id_fkey";
    ALTER TABLE "crm_appointments" DROP CONSTRAINT IF EXISTS "crm_appointments_assigned_to_user_id_fkey";

    DROP TABLE IF EXISTS "crm_appointment_collaborators";
    DROP TABLE IF EXISTS "crm_appointments";

    DROP TYPE IF EXISTS "CrmAppointmentStatus";
    DROP TYPE IF EXISTS "CrmAppointmentType";
  END IF;
END $$;
