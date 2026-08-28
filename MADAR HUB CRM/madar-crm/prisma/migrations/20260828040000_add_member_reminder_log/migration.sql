-- Records reminders sent to members, so a daily run cannot mail the same
-- person twice about the same due date.
CREATE TABLE "MemberReminderLog" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "stage" TEXT NOT NULL,
    "sentTo" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberReminderLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemberReminderLog_leadId_dueDate_stage_key"
    ON "MemberReminderLog"("leadId", "dueDate", "stage");
CREATE INDEX "MemberReminderLog_sentAt_idx" ON "MemberReminderLog"("sentAt");

ALTER TABLE "MemberReminderLog" ADD CONSTRAINT "MemberReminderLog_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
