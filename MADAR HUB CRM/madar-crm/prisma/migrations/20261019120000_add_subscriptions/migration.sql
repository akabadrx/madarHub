-- One person can hold several subscriptions — Zuna Real Estate, Zuna
-- Logistics and Zuna Trio under one contact — each with its own plan, due
-- date and payment status. Until now a Lead was its own single membership.
--
-- The backfill at the end gives every current member exactly one
-- subscription carrying all of their existing payments, so every status, due
-- date and reminder reads the same the moment this runs as it did before.
-- Staff then split a person's payments across further subscriptions in the CRM.

-- DropIndex
DROP INDEX "MemberReminderLog_leadId_dueDate_stage_key";

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "subscriptionId" TEXT;

-- AlterTable
ALTER TABLE "PesapalPayment" ADD COLUMN     "subscriptionId" TEXT;

-- AlterTable
ALTER TABLE "MomoPayment" ADD COLUMN     "subscriptionId" TEXT;

-- AlterTable
ALTER TABLE "MemberReminderLog" ADD COLUMN     "subscriptionId" TEXT;

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "label" TEXT,
    "packageId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Subscription_leadId_idx" ON "Subscription"("leadId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");

-- CreateIndex
CREATE INDEX "MemberReminderLog_leadId_idx" ON "MemberReminderLog"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "MemberReminderLog_subscriptionId_dueDate_stage_key" ON "MemberReminderLog"("subscriptionId", "dueDate", "stage");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesapalPayment" ADD CONSTRAINT "PesapalPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomoPayment" ADD CONSTRAINT "MomoPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberReminderLog" ADD CONSTRAINT "MemberReminderLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill: one subscription per current member (the statuses in
-- ACTIVE_MEMBER_STATUSES). Its plan is what the old logic billed them on —
-- the package of their latest payment, falling back to the suggested package
-- — and it starts at their first payment. The id is derived from the Lead so
-- the payments below can find it without a join.
INSERT INTO "Subscription" ("id", "leadId", "packageId", "status", "startDate", "createdAt", "updatedAt")
SELECT
  'sub_' || l."id",
  l."id",
  COALESCE(
    (SELECT p."packageId" FROM "Payment" p WHERE p."leadId" = l."id" ORDER BY p."paymentDate" DESC LIMIT 1),
    l."suggestedPackageId"
  ),
  'active',
  COALESCE((SELECT MIN(p."paymentDate") FROM "Payment" p WHERE p."leadId" = l."id"), l."createdAt"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Lead" l
WHERE l."status" IN ('Paid Monthly', 'Active Member');

UPDATE "Payment" p
SET "subscriptionId" = s."id"
FROM "Subscription" s
WHERE s."id" = 'sub_' || p."leadId";

-- Reminders already sent stay recorded against the new subscription, so the
-- cutover cannot re-send one for a due date that was already mailed.
UPDATE "MemberReminderLog" r
SET "subscriptionId" = s."id"
FROM "Subscription" s
WHERE s."id" = 'sub_' || r."leadId";
