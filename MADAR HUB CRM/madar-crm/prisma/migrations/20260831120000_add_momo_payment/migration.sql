-- CreateTable
CREATE TABLE "MomoPayment" (
    "id" TEXT NOT NULL,
    "merchantReference" TEXT NOT NULL,
    "momoReferenceId" TEXT,
    "packageId" TEXT,
    "packageName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "chargedAmount" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT,
    "customerPhone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'website',
    "failureReason" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MomoPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MomoPayment_merchantReference_key" ON "MomoPayment"("merchantReference");

-- CreateIndex
CREATE UNIQUE INDEX "MomoPayment_momoReferenceId_key" ON "MomoPayment"("momoReferenceId");

-- CreateIndex
CREATE INDEX "MomoPayment_status_idx" ON "MomoPayment"("status");

-- CreateIndex
CREATE INDEX "MomoPayment_customerPhone_idx" ON "MomoPayment"("customerPhone");

-- AddForeignKey
ALTER TABLE "MomoPayment" ADD CONSTRAINT "MomoPayment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MomoPayment" ADD CONSTRAINT "MomoPayment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
