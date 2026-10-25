-- CreateTable
CREATE TABLE "DpoPayment" (
    "id" TEXT NOT NULL,
    "merchantReference" TEXT NOT NULL,
    "transToken" TEXT,
    "transRef" TEXT,
    "packageId" TEXT,
    "packageName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "chargedAmount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'website',
    "subscriptionId" TEXT,
    "testMode" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DpoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DpoPayment_merchantReference_key" ON "DpoPayment"("merchantReference");

-- CreateIndex
CREATE UNIQUE INDEX "DpoPayment_transToken_key" ON "DpoPayment"("transToken");

-- CreateIndex
CREATE INDEX "DpoPayment_status_idx" ON "DpoPayment"("status");

-- CreateIndex
CREATE INDEX "DpoPayment_customerEmail_idx" ON "DpoPayment"("customerEmail");

-- AddForeignKey
ALTER TABLE "DpoPayment" ADD CONSTRAINT "DpoPayment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpoPayment" ADD CONSTRAINT "DpoPayment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DpoPayment" ADD CONSTRAINT "DpoPayment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

