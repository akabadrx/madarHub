-- AlterTable
ALTER TABLE "Package" ADD COLUMN "slug" TEXT;

-- CreateTable
CREATE TABLE "PesapalPayment" (
    "id" TEXT NOT NULL,
    "merchantReference" TEXT NOT NULL,
    "packageId" TEXT,
    "packageName" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "customerName" TEXT NOT NULL,
    "customerEmail" TEXT NOT NULL,
    "customerPhone" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pesapalTrackingId" TEXT,
    "leadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PesapalPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Package_slug_key" ON "Package"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PesapalPayment_merchantReference_key" ON "PesapalPayment"("merchantReference");

-- CreateIndex
CREATE INDEX "PesapalPayment_status_idx" ON "PesapalPayment"("status");

-- CreateIndex
CREATE INDEX "PesapalPayment_customerEmail_idx" ON "PesapalPayment"("customerEmail");

-- AddForeignKey
ALTER TABLE "PesapalPayment" ADD CONSTRAINT "PesapalPayment_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PesapalPayment" ADD CONSTRAINT "PesapalPayment_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
