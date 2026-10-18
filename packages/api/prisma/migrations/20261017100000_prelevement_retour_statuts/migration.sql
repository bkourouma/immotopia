-- Spec 042 P3 : statuts de constat d'une ligne de remise.
-- ALTER TYPE ... ADD VALUE reste seul dans sa migration : une valeur d'enum
-- ajoutée ne doit pas être utilisée dans la même transaction.
ALTER TYPE "DirectDebitRemittanceLineStatus" ADD VALUE 'SETTLED';
ALTER TYPE "DirectDebitRemittanceLineStatus" ADD VALUE 'REJECTED';
