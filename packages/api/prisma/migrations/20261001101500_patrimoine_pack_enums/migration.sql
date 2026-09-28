-- Pack Patrimoine (lot P1, decisions du 28/09/2026) : nouvelles valeurs d'enums.
--
-- Isolees dans leur propre migration : PostgreSQL refuse d'utiliser une valeur
-- ajoutee par ALTER TYPE ... ADD VALUE dans la transaction qui l'a creee.
-- L'amorcage du catalogue qui s'en sert est la migration suivante
-- (20261001101600_patrimoine_pack_catalogue).

-- Module des packs Patrimoine : biens detenus en propre, gestion locative
-- directe, sans mandat pour un tiers.
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'MODULE_PATRIMOINE';

-- Capacite comptee par les packs Patrimoine : le bien detenu, loue ou non.
ALTER TYPE "CapacityKey" ADD VALUE IF NOT EXISTS 'BIENS_DETENUS';

-- Nature d'unite du registre (lot_activations) : bien detenu compte dans
-- BIENS_DETENUS et non dans LOTS. La cle d'unite reste P:<propertyId>, si
-- bien qu'un meme bien n'est jamais compte deux fois.
ALTER TYPE "LotKind" ADD VALUE IF NOT EXISTS 'HELD_PROPERTY';
