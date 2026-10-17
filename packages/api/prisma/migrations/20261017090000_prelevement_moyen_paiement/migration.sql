-- Spec 042 P2 : le prélèvement bancaire devient un moyen de paiement des loyers.
-- Valeur ajoutée seule dans sa migration : PostgreSQL interdit de l utiliser dans la transaction qui la crée.
ALTER TYPE "RentalPaymentMethod" ADD VALUE 'DIRECT_DEBIT';
