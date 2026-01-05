-- Cleanup script: Drop all rental tables and enums
-- Run this manually if the migration was partially applied with wrong types

-- Drop foreign key constraints first
DROP TABLE IF EXISTS "rental_documents" CASCADE;
DROP TABLE IF EXISTS "rental_deposit_movements" CASCADE;
DROP TABLE IF EXISTS "rental_security_deposits" CASCADE;
DROP TABLE IF EXISTS "rental_penalties" CASCADE;
DROP TABLE IF EXISTS "rental_penalty_rules" CASCADE;
DROP TABLE IF EXISTS "rental_refunds" CASCADE;
DROP TABLE IF EXISTS "rental_payment_allocations" CASCADE;
DROP TABLE IF EXISTS "rental_payments" CASCADE;
DROP TABLE IF EXISTS "rental_installment_items" CASCADE;
DROP TABLE IF EXISTS "rental_installments" CASCADE;
DROP TABLE IF EXISTS "rental_lease_co_renters" CASCADE;
DROP TABLE IF EXISTS "rental_leases" CASCADE;

-- Drop enums
DROP TYPE IF EXISTS "RentalDocumentStatus" CASCADE;
DROP TYPE IF EXISTS "RentalDocumentType" CASCADE;
DROP TYPE IF EXISTS "RentalDepositMovementType" CASCADE;
DROP TYPE IF EXISTS "RentalPenaltyMode" CASCADE;
DROP TYPE IF EXISTS "MobileMoneyOperator" CASCADE;
DROP TYPE IF EXISTS "RentalPaymentStatus" CASCADE;
DROP TYPE IF EXISTS "RentalPaymentMethod" CASCADE;
DROP TYPE IF EXISTS "RentalChargeType" CASCADE;
DROP TYPE IF EXISTS "RentalInstallmentStatus" CASCADE;
DROP TYPE IF EXISTS "RentalBillingFrequency" CASCADE;
DROP TYPE IF EXISTS "RentalLeaseStatus" CASCADE;





