-- Records where a checkout began: "website" (public pricing page) or
-- "membership" (a signed-in member paying from the portal).
-- Additive with a default, so existing rows keep working unchanged.
ALTER TABLE "PesapalPayment" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'website';
