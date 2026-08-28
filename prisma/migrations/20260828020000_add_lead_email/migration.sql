-- Email on a Lead, so the member portal can identify a member by email rather
-- than by phone number.
ALTER TABLE "Lead" ADD COLUMN "email" TEXT;

CREATE INDEX "Lead_email_idx" ON "Lead"("email");

-- Seed from online payments, the only place an email was recorded until now.
-- Newest completed payment wins where a lead has several.
UPDATE "Lead" l
SET email = p."customerEmail"
FROM (
    SELECT DISTINCT ON ("leadId") "leadId", "customerEmail"
    FROM "PesapalPayment"
    WHERE status = 'COMPLETED' AND "leadId" IS NOT NULL AND "customerEmail" <> ''
    ORDER BY "leadId", "createdAt" DESC
) p
WHERE p."leadId" = l.id AND l.email IS NULL;
