-- Aligner le schema sur le contrat gele du lot 2.
--
-- Quatre ecarts entre le contrat et le schema, tous introduits par le
-- superviseur a une heure d'intervalle, et tous trouves par les agents qui ont
-- du les contourner. Trois se corrigent ici ; le quatrieme (absence de lien
-- entre un poste de depense et un compte comptable) releve du plan analytique
-- et attend le lot 3.
--
--   1. `zone` et `start_date` etaient obligatoires alors que le contrat les
--      dit facultatives. L'agent devait combler par une chaine vide et la date
--      du jour. Une valeur inventee est pire qu'une valeur absente : elle se
--      lit comme une vraie.
--   2. `suppliers` n'avait pas de colonne pour le nom du contact, que le
--      contrat accepte en entree. La saisie etait perdue en silence.
--   3. `cost_categories` n'avait pas d'ordre d'affichage, que le contrat
--      promet. Il se deduisait de l'ordre de creation, si bien qu'un poste
--      ajoute apres coup ne pouvait jamais etre remonte.
--
-- Migration elargissante et additive : retirer une contrainte NOT NULL et
-- ajouter une colonne nullable ou a valeur par defaut ne peut rien perdre.
-- Les trois tables ont ete creees le jour meme et sont vides.

-- AlterTable
ALTER TABLE "construction_sites" ALTER COLUMN "zone" DROP NOT NULL,
ALTER COLUMN "start_date" DROP NOT NULL;

-- AlterTable
ALTER TABLE "cost_categories" ADD COLUMN     "position" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "contact_name" TEXT;

