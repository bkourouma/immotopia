-- Only run when table exists (no-op on shadow DB when payment_declarations created later by catch-all)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'rental_payment_declarations') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'rental_payment_declarations' AND column_name = 'transaction_phone'
    ) THEN
      ALTER TABLE "rental_payment_declarations" ADD COLUMN "transaction_phone" TEXT;
    END IF;
  END IF;
END $$;
