-- Spec 047 : paiement mobile money declare. Nouvelle provenance DECLARED des paiements de charges.
--
-- Fichier a part, volontairement : PostgreSQL n'autorise pas l'utilisation d'une valeur d'enum
-- ajoutee dans la transaction qui l'a creee, et Prisma execute chaque migration dans une
-- transaction. Rien ne reference DECLARED dans la migration suivante (20261017150100) : la valeur
-- n'est utilisee que par le code applicatif.

-- AlterEnum
ALTER TYPE "ChargePaymentOrigin" ADD VALUE 'DECLARED';
