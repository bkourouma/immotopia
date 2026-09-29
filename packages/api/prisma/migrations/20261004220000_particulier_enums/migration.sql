-- Lot 4A (espace particulier en libre-service) : nouvelles valeurs d'enum.
--
-- Fichier separe de 20261004220100_particulier_catalogue : une valeur d'enum
-- ajoutee ne peut pas etre utilisee dans la transaction qui l'ajoute
-- (PostgreSQL : « unsafe use of new value »). Les lignes de catalogue qui
-- emploient 'ACTIFS' sont donc dans la migration suivante.

ALTER TYPE "TenantType" ADD VALUE IF NOT EXISTS 'PARTICULIER';

ALTER TYPE "CapacityKey" ADD VALUE IF NOT EXISTS 'ACTIFS';
