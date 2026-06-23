-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "aiConfidence" DOUBLE PRECISION,
ADD COLUMN     "aiSummary" TEXT,
ADD COLUMN     "rawWhatsappSnippet" TEXT;
