import { getDb } from "@/lib/db";
import { leadDisplayName, formatDate } from "@/lib/utils";

function dayStart(date = new Date()) { const d = new Date(date); d.setHours(0, 0, 0, 0); return d; }
function dayEnd(date = new Date()) { const d = new Date(date); d.setHours(23, 59, 59, 999); return d; }

export type FollowUpDigest = {
  overdue: Awaited<ReturnType<typeof fetchFollowUpLeads>>["overdue"];
  today: Awaited<ReturnType<typeof fetchFollowUpLeads>>["today"];
};

async function fetchFollowUpLeads() {
  const db = getDb();
  const start = dayStart();
  const end = dayEnd();
  const [overdue, today] = await Promise.all([
    db.lead.findMany({
      where: { followUpDate: { lt: start } },
      include: { suggestedPackage: true },
      orderBy: { followUpDate: "asc" },
    }),
    db.lead.findMany({
      where: { followUpDate: { gte: start, lte: end } },
      include: { suggestedPackage: true },
      orderBy: { followUpDate: "asc" },
    }),
  ]);
  return { overdue, today };
}

function escapeHtml(text: string | null | undefined) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function buildLeadRow(lead: { id: string; name: string | null; phone: string; status: string; followUpDate: Date | null; interest: string | null; suggestedPackage: { name: string } | null }, isOverdue: boolean, crmBaseUrl: string) {
  const name = escapeHtml(leadDisplayName(lead.name, lead.phone));
  const date = lead.followUpDate ? formatDate(lead.followUpDate, true) : "Not set";
  const pkg = escapeHtml(lead.suggestedPackage?.name || lead.interest || "Not set");
  const dateColor = isOverdue ? "#dc2626" : "#92400e";
  return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">
      <a href="${crmBaseUrl}/leads/${lead.id}" style="color:#0b1f3a;font-weight:600;text-decoration:none;">${name}</a>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">${escapeHtml(lead.phone)}</div>
    </td>
    <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${escapeHtml(lead.status)}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:${dateColor};font-weight:${isOverdue ? "600" : "400"};">${date}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#475569;">${pkg}</td>
  </tr>`;
}

export function buildDigestHtml(overdue: { id: string; name: string | null; phone: string; status: string; followUpDate: Date | null; interest: string | null; suggestedPackage: { name: string } | null }[], today: { id: string; name: string | null; phone: string; status: string; followUpDate: Date | null; interest: string | null; suggestedPackage: { name: string } | null }[], crmBaseUrl: string) {
  const total = overdue.length + today.length;
  const dateStr = new Date().toLocaleDateString("en-RW", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  const sections: string[] = [];
  if (overdue.length > 0) {
    sections.push(`<h2 style="color:#dc2626;font-size:16px;margin:24px 0 8px 0;">Overdue (${overdue.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#fef2f2;"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fecaca;font-size:12px;text-transform:uppercase;color:#991b1b;">Lead</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fecaca;font-size:12px;text-transform:uppercase;color:#991b1b;">Status</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fecaca;font-size:12px;text-transform:uppercase;color:#991b1b;">Follow-up</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fecaca;font-size:12px;text-transform:uppercase;color:#991b1b;">Interest</th></tr></thead>
        <tbody>${overdue.map((l) => buildLeadRow(l, true, crmBaseUrl)).join("")}</tbody>
      </table>`);
  }
  if (today.length > 0) {
    sections.push(`<h2 style="color:#92400e;font-size:16px;margin:24px 0 8px 0;">Due today (${today.length})</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        <thead><tr style="background:#fffbeb;"><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fde68a;font-size:12px;text-transform:uppercase;color:#92400e;">Lead</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fde68a;font-size:12px;text-transform:uppercase;color:#92400e;">Status</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fde68a;font-size:12px;text-transform:uppercase;color:#92400e;">Follow-up</th><th style="padding:8px 12px;text-align:left;border-bottom:2px solid #fde68a;font-size:12px;text-transform:uppercase;color:#92400e;">Interest</th></tr></thead>
        <tbody>${today.map((l) => buildLeadRow(l, false, crmBaseUrl)).join("")}</tbody>
      </table>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:#0b1f3a;border-radius:12px 12px 0 0;padding:24px 28px;">
      <h1 style="color:#fff;font-size:20px;margin:0;">Madar Hub CRM</h1>
      <p style="color:#d4a72c;font-size:13px;margin:4px 0 0 0;">Daily follow-up digest</p>
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:28px;border:1px solid #e2e8f0;border-top:none;">
      <p style="color:#64748b;font-size:14px;margin:0 0 4px 0;">${dateStr}</p>
      <p style="color:#0b1f3a;font-size:18px;font-weight:600;margin:0 0 16px 0;">${total === 0 ? "No follow-ups pending today." : `${total} lead${total > 1 ? "s" : ""} need attention.`}</p>
      ${total === 0 ? `<p style="color:#64748b;font-size:14px;">You're all caught up. Check back tomorrow or visit the CRM dashboard.</p>` : sections.join("")}
      <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;">
        <a href="${crmBaseUrl}/follow-ups" style="display:inline-block;background:#d4a72c;color:#0b1f3a;font-weight:600;font-size:14px;padding:10px 24px;border-radius:8px;text-decoration:none;">Open follow-ups in CRM</a>
      </div>
    </div>
    <p style="color:#94a3b8;font-size:12px;text-align:center;margin-top:16px;">This is an automated daily digest from Madar Hub CRM.</p>
  </div>
</body></html>`;
}

export async function sendFollowUpDigestEmail(opts: { to: string; from: string; crmBaseUrl: string; resendApiKey: string }) {
  const { overdue, today } = await fetchFollowUpLeads();
  const total = overdue.length + today.length;

  if (total === 0) {
    return { success: true, sent: false, message: "No follow-ups pending. No email sent." };
  }

  const html = buildDigestHtml(overdue, today, opts.crmBaseUrl);
  const subject = total === 0
    ? "Madar Hub CRM - No follow-ups today"
    : `Madar Hub CRM - ${total} lead${total > 1 ? "s" : ""} need follow-up`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${opts.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: opts.to,
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend API error ${response.status}: ${errorBody.slice(0, 300)}`);
  }

  const data = await response.json();
  return { success: true, sent: true, messageId: data.id, total, overdue: overdue.length, today: today.length };
}
