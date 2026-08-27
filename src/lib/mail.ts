// Transactional email through Resend, matching how the CRM already sends mail.
//
// When RESEND_API_KEY is unset the message is logged instead of sent, so the
// password-reset flow can be exercised end to end in development without a key
// and without silently pretending a real email went out.

type SendArgs = { to: string; subject: string; html: string };

export async function sendEmail({ to, subject, html }: SendArgs): Promise<{ sent: boolean }> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || "Madar Hub <onboarding@resend.dev>";

  if (!apiKey) {
    console.warn(`[mail] RESEND_API_KEY unset — not sending "${subject}" to ${to}`);
    return { sent: false };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html }),
  });

  if (!response.ok) {
    console.error(`[mail] Resend returned ${response.status} for "${subject}"`);
    return { sent: false };
  }
  return { sent: true };
}

/** Brand-matched wrapper, same navy/gold treatment as the CRM's emails. */
export function emailLayout(heading: string, bodyHtml: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F8F6F0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px;">
    <div style="background:#071A2D;border-radius:16px 16px 0 0;padding:26px 30px;">
      <h1 style="color:#fff;font-size:20px;margin:0;">Madar Hub</h1>
      <p style="color:#D6A84F;font-size:13px;margin:4px 0 0 0;">Membership</p>
    </div>
    <div style="background:#fff;border-radius:0 0 16px 16px;padding:30px;border:1px solid #E5E7EB;border-top:none;">
      <h2 style="color:#071A2D;font-size:18px;margin:0 0 14px 0;">${heading}</h2>
      ${bodyHtml}
    </div>
    <p style="color:#667085;font-size:12px;text-align:center;margin-top:16px;">madarorbit.com</p>
  </div>
</body></html>`;
}
