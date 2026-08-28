import { getDb } from "@/lib/db";
import { ACTIVE_MEMBER_STATUSES } from "@/lib/constants";
import { getMembershipPaymentStatus, type MembershipPaymentInfo } from "@/lib/membership";
import { formatDate, formatRwf, leadDisplayName } from "@/lib/utils";

/**
 * Payment reminders sent to the member, not to staff.
 *
 * Who is reminded follows getMembershipPaymentStatus: a member on a monthly
 * package, or an active member with no package assigned (a negotiated deal),
 * both of whom are due a month after their last payment. A day pass or an
 * hourly booking is a one-off and is never chased.
 *
 * Three stages, each sent at most once per due date. The unique constraint on
 * MemberReminderLog is what enforces that, so a cron that runs twice, or a
 * manual re-run, cannot mail anyone a second time.
 */

export type ReminderStage = "due_soon" | "due_now" | "final_notice";

/** Days before the due date that the first, gentle reminder goes out. */
const DUE_SOON_LEAD_DAYS = 3;
/** Days of grace left at which the last warning goes out. */
const FINAL_NOTICE_DAYS_LEFT = 2;

export type ReminderCandidate = {
  leadId: string;
  name: string;
  email: string;
  stage: ReminderStage;
  info: MembershipPaymentInfo;
  packageName: string | null;
  /** info.dueAmount is 0 until a member is overdue, so fall back to the
   *  package price — an email that omits the amount is a support question. */
  amountDue: number;
};

function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/**
 * Decides which reminder, if any, a member is due right now.
 *
 * Returns null when nothing should be sent — either the payment is not close
 * enough to mention, or the membership is already suspended, at which point
 * staff take over rather than the system carrying on emailing.
 */
export function stageFor(info: MembershipPaymentInfo, now = new Date()): ReminderStage | null {
  if (info.status === "Suspended") return null;

  if (info.status === "Active") {
    const daysUntilDue = daysBetween(now, info.nextPaymentDate);
    // The due date itself still reads as Active, because the grace period only
    // starts once it has passed. It is the one-month mark and the whole point
    // of the reminder, so it sends the "due now" notice rather than nothing.
    if (daysUntilDue === 0) return "due_now";
    return daysUntilDue > 0 && daysUntilDue <= DUE_SOON_LEAD_DAYS ? "due_soon" : null;
  }

  // Delayed Payment: inside the grace period.
  return info.daysUntilSuspension <= FINAL_NOTICE_DAYS_LEFT ? "final_notice" : "due_now";
}

/** Active members who should receive a reminder today and have not had one. */
export async function findReminderCandidates(now = new Date()): Promise<{
  candidates: ReminderCandidate[];
  skippedNoEmail: number;
}> {
  const db = getDb();
  const members = await db.lead.findMany({
    where: { status: { in: [...ACTIVE_MEMBER_STATUSES] } },
    include: {
      suggestedPackage: true,
      payments: { include: { package: true }, orderBy: { paymentDate: "desc" }, take: 1 },
    },
  });

  const candidates: ReminderCandidate[] = [];
  let skippedNoEmail = 0;

  for (const member of members) {
    const latestPayment = member.payments[0];
    const memberPackage = latestPayment?.package || member.suggestedPackage;
    const info = getMembershipPaymentStatus(
      memberPackage,
      latestPayment?.paymentDate,
      latestPayment?.amount,
      now,
    );
    if (!info) continue;

    const stage = stageFor(info, now);
    if (!stage) continue;

    if (!member.email) {
      skippedNoEmail += 1;
      continue;
    }

    const already = await db.memberReminderLog.findUnique({
      where: {
        leadId_dueDate_stage: {
          leadId: member.id,
          dueDate: startOfDay(info.nextPaymentDate),
          stage,
        },
      },
      select: { id: true },
    });
    if (already) continue;

    candidates.push({
      leadId: member.id,
      name: leadDisplayName(member.name, member.phone),
      email: member.email,
      stage,
      info,
      packageName: memberPackage?.name ?? null,
      amountDue: info.dueAmount || memberPackage?.price || latestPayment?.amount || 0,
    });
  }

  return { candidates, skippedNoEmail };
}

const COPY: Record<ReminderStage, { subject: (name: string) => string; lead: (days: number) => string }> = {
  due_soon: {
    subject: () => "Your Madar Hub membership renews in a few days",
    lead: (days) =>
      `Your membership payment is due in ${days} day${days === 1 ? "" : "s"}. You can renew online in one tap — your details are already saved.`,
  },
  due_now: {
    subject: () => "Your Madar Hub membership payment is due",
    lead: (days) =>
      `Your membership payment is now due. You have ${days} day${days === 1 ? "" : "s"} of grace left before your desk is suspended.`,
  },
  final_notice: {
    subject: () => "Last reminder: your Madar Hub membership is about to be suspended",
    lead: (days) =>
      `This is a final reminder. Your desk will be suspended in ${days} day${days === 1 ? "" : "s"} unless payment is received.`,
  },
};

export function buildMemberReminderHtml(candidate: ReminderCandidate, portalUrl: string): string {
  const { info, stage } = candidate;
  const firstName = candidate.name.trim().split(/\s+/)[0] || "there";
  const days = stage === "due_soon" ? daysBetween(new Date(), info.nextPaymentDate) : info.daysUntilSuspension;
  const amount = candidate.amountDue;
  const accent = stage === "final_notice" ? "#B3261E" : stage === "due_now" ? "#B45309" : "#0b1f3a";

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#071A2D;border-radius:16px 16px 0 0;padding:26px 30px;">
      <h1 style="color:#fff;font-size:20px;margin:0;">Madar Hub</h1>
      <p style="color:#D6A84F;font-size:13px;margin:4px 0 0 0;">Membership</p>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px;border:1px solid #E5E7EB;border-top:none;">
      <p style="color:#0b1f3a;font-size:16px;margin:0 0 14px 0;">Hi ${firstName},</p>
      <p style="color:${accent};font-size:15px;line-height:1.6;margin:0 0 22px 0;font-weight:600;">
        ${COPY[stage].lead(days)}
      </p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:24px;">
        <tr><td style="padding:8px 0;color:#667085;">Package</td><td style="padding:8px 0;color:#0b1f3a;font-weight:600;text-align:right;">${candidate.packageName ?? "Monthly membership"}</td></tr>
        <tr><td style="padding:8px 0;color:#667085;">Due date</td><td style="padding:8px 0;color:#0b1f3a;font-weight:600;text-align:right;">${formatDate(info.nextPaymentDate)}</td></tr>
        ${amount > 0 ? `<tr><td style="padding:8px 0;color:#667085;">Amount</td><td style="padding:8px 0;color:#0b1f3a;font-weight:700;text-align:right;">${formatRwf(amount)}</td></tr>` : ""}
      </table>
      <a href="${portalUrl}" style="display:inline-block;background:#D6A84F;color:#071A2D;font-weight:700;font-size:15px;padding:13px 30px;border-radius:999px;text-decoration:none;">Renew now</a>
      <p style="color:#667085;font-size:13px;line-height:1.6;margin:24px 0 0 0;">
        Prices exclude VAT. 18% VAT and Pesapal's 3% online payment fee are added at checkout.
        Already paid at the front desk? Then please ignore this — it can take us a day to record it.
      </p>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px;">
      You are receiving this because you have an active membership at Madar Hub.
      Questions? Reply on WhatsApp: 0783 662 543.
    </p>
  </div>
</body></html>`;
}

export function reminderSubject(candidate: ReminderCandidate): string {
  return COPY[candidate.stage].subject(candidate.name);
}

/**
 * Sends today's reminders.
 *
 * `dryRun` returns exactly who would be mailed without sending anything, which
 * is how this should be checked before it is first switched on — a mistake here
 * reaches every paying member at once and cannot be recalled.
 */
export async function sendMemberReminders(opts: {
  from: string;
  portalUrl: string;
  resendApiKey: string;
  dryRun?: boolean;
  now?: Date;
}) {
  const now = opts.now ?? new Date();
  const { candidates, skippedNoEmail } = await findReminderCandidates(now);

  if (opts.dryRun) {
    return {
      success: true,
      dryRun: true,
      wouldSend: candidates.length,
      skippedNoEmail,
      recipients: candidates.map((c) => ({
        name: c.name,
        email: c.email,
        stage: c.stage,
        due: formatDate(c.info.nextPaymentDate),
        amount: c.amountDue,
      })),
    };
  }

  const db = getDb();
  const sent: string[] = [];
  const failed: { email: string; error: string }[] = [];

  for (const candidate of candidates) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${opts.resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: opts.from,
          to: candidate.email,
          subject: reminderSubject(candidate),
          html: buildMemberReminderHtml(candidate, opts.portalUrl),
        }),
      });

      if (!response.ok) {
        failed.push({ email: candidate.email, error: `Resend ${response.status}` });
        continue;
      }

      // Logged only after a successful send, so a failure is retried tomorrow
      // rather than being silently marked as delivered.
      await db.memberReminderLog.create({
        data: {
          leadId: candidate.leadId,
          dueDate: startOfDay(candidate.info.nextPaymentDate),
          stage: candidate.stage,
          sentTo: candidate.email,
        },
      });
      sent.push(candidate.email);
    } catch (error) {
      failed.push({ email: candidate.email, error: error instanceof Error ? error.message : "unknown" });
    }
  }

  return { success: true, sent: sent.length, failed, skippedNoEmail, candidates: candidates.length };
}
