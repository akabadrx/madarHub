-- Store invoice and purchase amounts to the cent, as EBM receipts and RRA's
-- VAT annex carry them, and let an invoice imported from a filed annex go
-- without the phone and payment details the annex does not include. Existing
-- whole-franc amounts convert unchanged.
-- AlterTable
ALTER TABLE "Invoice" ALTER COLUMN "buyerPhone" DROP NOT NULL,
ALTER COLUMN "unitPrice" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "vatAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "paymentMethod" DROP NOT NULL,
ALTER COLUMN "paymentDate" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Purchase" ALTER COLUMN "totalAmount" SET DATA TYPE DECIMAL(14,2),
ALTER COLUMN "vatAmount" SET DEFAULT 0,
ALTER COLUMN "vatAmount" SET DATA TYPE DECIMAL(14,2);

