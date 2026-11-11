-- Custom monthly prices (including the Loyalty Rate), the member's consent to
-- their terms, an audit trail of every change, and early-termination penalties.

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "penaltyAmount" INTEGER,
ADD COLUMN     "penaltyPaidAt" TIMESTAMP(3),
ADD COLUMN     "terminatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PriceOverride" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'custom',
    "amount" INTEGER NOT NULL,
    "vatInclusive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "commitmentMonths" INTEGER,
    "terms" TEXT,
    "termsVersion" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PriceOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TermsAcceptance" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "portalUserId" TEXT NOT NULL,
    "termsVersion" TEXT NOT NULL,
    "ipAddress" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TermsAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingAuditLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "action" TEXT NOT NULL,
    "changedBy" TEXT NOT NULL,
    "oldAmount" INTEGER,
    "newAmount" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PriceOverride_subscriptionId_key" ON "PriceOverride"("subscriptionId");

-- CreateIndex
CREATE INDEX "TermsAcceptance_subscriptionId_termsVersion_idx" ON "TermsAcceptance"("subscriptionId", "termsVersion");

-- CreateIndex
CREATE INDEX "BillingAuditLog_leadId_createdAt_idx" ON "BillingAuditLog"("leadId", "createdAt");

-- AddForeignKey
ALTER TABLE "PriceOverride" ADD CONSTRAINT "PriceOverride_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TermsAcceptance" ADD CONSTRAINT "TermsAcceptance_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingAuditLog" ADD CONSTRAINT "BillingAuditLog_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
