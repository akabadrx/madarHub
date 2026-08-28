"use client";

import { useState } from "react";
import { Send, Check, Copy } from "lucide-react";
import { issuePortalInvite } from "@/app/actions";

/**
 * Generates a portal invite and opens WhatsApp with the message ready to send.
 *
 * The window is opened synchronously from the click, before awaiting the
 * server action — a popup opened after an await is blocked by the browser.
 */
export function PortalInviteButton({
  leadId,
  linked,
  className = "btn btn-outline",
}: {
  leadId: string;
  linked: boolean;
  className?: string;
}) {
  const [pending, setPending] = useState(false);
  const [signupUrl, setSignupUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setPending(true);
    setError(null);
    const tab = window.open("", "_blank");
    try {
      const { whatsappUrl, signupUrl: url } = await issuePortalInvite(leadId);
      setSignupUrl(url);
      if (tab) tab.location.href = whatsappUrl;
      else window.location.href = whatsappUrl;
    } catch {
      tab?.close();
      setError("Could not create the invite. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button className={className} type="button" onClick={handleClick} disabled={pending}>
        <Send size={16} />
        {pending ? "Creating…" : linked ? "Resend portal invite" : "Invite to portal"}
      </button>

      {error ? <p className="text-xs text-red-600">{error}</p> : null}

      {signupUrl ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-[#0b1f3a]"
          onClick={async () => {
            await navigator.clipboard.writeText(signupUrl);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? "Link copied" : "Copy link instead"}
        </button>
      ) : null}
    </div>
  );
}
