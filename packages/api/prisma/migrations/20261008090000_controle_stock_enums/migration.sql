-- Lot 040 (spec 040, data-model §5, migration 1) : valeurs d'enumeration ajoutees
-- par le controle du stock de chantier.
-- Migration separee : une valeur ajoutee par ALTER TYPE ... ADD VALUE ne peut pas
-- servir dans la meme transaction (precedent :
-- 20261007150100_secure_link_scope_installment_payment). Aucune valeur n'est
-- utilisee ici ; la migration 20261008090100_controle_stock s'en sert (index
-- partiels, contrainte CHECK).

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'SUPPLIER_RETURN';
ALTER TYPE "StockMovementType" ADD VALUE 'SCRAP';

-- AlterEnum
ALTER TYPE "StockCountStatus" ADD VALUE 'COUNTED';
ALTER TYPE "StockCountStatus" ADD VALUE 'CANCELLED';

-- AlterEnum
ALTER TYPE "SourceType" ADD VALUE 'STOCK_SUPPLIER_RETURN';
ALTER TYPE "SourceType" ADD VALUE 'STOCK_SCRAP';
