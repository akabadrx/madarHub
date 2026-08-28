-- Staff-issued invites to the member portal, and a flag showing which leads
-- already have an account connected.
ALTER TABLE "Lead" ADD COLUMN "portalLinkedAt" TIMESTAMP(3);

CREATE TABLE "PortalInvite" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortalInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PortalInvite_tokenHash_key" ON "PortalInvite"("tokenHash");
CREATE INDEX "PortalInvite_leadId_createdAt_idx" ON "PortalInvite"("leadId", "createdAt");

ALTER TABLE "PortalInvite" ADD CONSTRAINT "PortalInvite_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
