-- Suites de l'audit de securite du lot S1 (defense en profondeur) : la cle
-- etrangere simple `syndicates.mandating_agency_id` -> `syndic_mandating_agencies.id`
-- ne verifiait pas l'agence. Elle devient composite sur (tenant_id,
-- mandating_agency_id) -> syndic_mandating_agencies(tenant_id, id), pour que
-- la base refuse elle-meme le rattachement d'une copropriete au mandant
-- d'une autre agence, meme si un bug applicatif oubliait le controle.
--
-- Genere par `prisma migrate diff` depuis le schema HEAD ; aucun ajustement
-- manuel necessaire (Prisma a exprime la relation composite proprement).
-- Aucune migration de rattrapage : les lignes existantes respectent deja
-- l'isolation par agence (`mandatingAgencyId` verifie a l'ecriture par
-- `lib/documents/mandating-agencies.ts`), donc aucune valeur ne peut violer
-- la nouvelle contrainte.

-- DropForeignKey
ALTER TABLE "syndicates" DROP CONSTRAINT "syndicates_mandating_agency_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "syndic_mandating_agencies_tenant_id_id_key" ON "syndic_mandating_agencies"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "syndicates" ADD CONSTRAINT "syndicates_tenant_id_mandating_agency_id_fkey" FOREIGN KEY ("tenant_id", "mandating_agency_id") REFERENCES "syndic_mandating_agencies"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

