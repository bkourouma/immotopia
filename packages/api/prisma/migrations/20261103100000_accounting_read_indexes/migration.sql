-- Lot C (comptabilite rapide) : index des lectures du journal, du grand livre
-- et des mandants. Pas de CONCURRENTLY : Prisma execute la migration en transaction.

-- CreateIndex
CREATE INDEX "journal_entries_tenant_id_entry_date_created_at_idx" ON "journal_entries"("tenant_id", "entry_date", "created_at");

-- CreateIndex
CREATE INDEX "journal_entries_tenant_id_journal_id_entry_date_idx" ON "journal_entries"("tenant_id", "journal_id", "entry_date");

-- CreateIndex
CREATE INDEX "journal_entry_lines_account_id_entry_id_idx" ON "journal_entry_lines"("account_id", "entry_id");

-- Index PARTIEL (SQL brut, non declarable en Prisma, donc invisible pour lui) :
-- lectures des fonds de mandants par proprietaire et par nature. Seules les
-- lignes qui portent une nature de fonds y figurent ; les lignes historiques
-- du compte de fonds sans nature passent par l'index (account_id, entry_id).
CREATE INDEX IF NOT EXISTS "journal_entry_lines_funds_owner_nature_idx"
  ON "journal_entry_lines"("third_party_account_id", "funds_nature")
  WHERE "funds_nature" IS NOT NULL;
