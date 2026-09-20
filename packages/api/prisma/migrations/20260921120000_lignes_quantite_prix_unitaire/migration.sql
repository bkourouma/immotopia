-- AlterTable
ALTER TABLE "budget_amendment_lines" ADD COLUMN     "quantity" DECIMAL(14,3),
ADD COLUMN     "unit_price" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "purchase_order_lines" ADD COLUMN     "quantity" DECIMAL(14,3),
ADD COLUMN     "unit_price" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "site_budget_lines" ADD COLUMN     "quantity" DECIMAL(14,3),
ADD COLUMN     "unit_price" DECIMAL(14,2);

-- AlterTable
ALTER TABLE "supplier_invoice_lines" ADD COLUMN     "quantity" DECIMAL(14,3),
ADD COLUMN     "unit_price" DECIMAL(14,2);

