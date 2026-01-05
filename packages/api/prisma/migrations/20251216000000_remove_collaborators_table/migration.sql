-- DropTable
DROP TABLE IF EXISTS "collaborators" CASCADE;

-- DropEnum (only if no other tables use it)
-- Note: CollaboratorRole enum is removed from schema, but we keep the DROP here for safety
-- If the enum is still used elsewhere, this will fail and you'll need to check
DROP TYPE IF EXISTS "CollaboratorRole";





