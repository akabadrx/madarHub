-- Pesapal keeps 3% of every charge and another 1% when settling to the bank, so
-- the charge is now grossed up to make the settled amount match the sale price.
-- That splits one number into two: "amount" stays the VAT-inclusive sale price
-- (what lands in the bank and what the CRM books as revenue), while
-- "chargedAmount" records what Pesapal actually billed the customer.
--
-- Nullable on purpose: rows created before the gross-up was introduced were
-- billed at "amount" exactly, and backfilling them would misstate history.
ALTER TABLE "PesapalPayment" ADD COLUMN "chargedAmount" INTEGER;
