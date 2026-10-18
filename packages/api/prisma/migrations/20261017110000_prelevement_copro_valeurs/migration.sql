-- Spec 042 P4 (copropriete) : valeurs d'enum seules, dans leur propre migration.
-- PostgreSQL n'autorise pas l'usage d'une valeur ajoutee par ALTER TYPE ... ADD VALUE
-- dans la transaction qui l'ajoute : rien d'autre ici (voir 20261017100000_prelevement_retour_statuts).

-- AlterEnum
ALTER TYPE "ChargePaymentOrigin" ADD VALUE 'DIRECT_DEBIT';

-- AlterEnum
ALTER TYPE "DirectDebitMandateScope" ADD VALUE 'SYNDIC_LOT';
