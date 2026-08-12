"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Check, Copy, Loader2, MessageCircle, Send, Timer } from "lucide-react";
import { toast } from "sonner";
import type { AnalyzeOutput } from "@/lib/lead-assistant-validation";
import { basePathUrl, whatsappUrl } from "@/lib/utils";

interface ConversationReplyProps {
  leadId: string;
  leadPhone: string;
  leadName?: string | null;
}

const fieldLabels: Record<string, string> = {
  name: "name",
  phone: "phone",
  leadType: "lead type",
  interest: "interest",
  status: "status",
  suggestedPackageId: "suggested package",
  language: "language",
  budgetMentioned: "budget",
  numberOfPeople: "people count",
  requestedDate: "requested date",
  requestedTime: "requested time",
  equipmentRequest: "equipment",
  nextAction: "next action",
  visitIntent: "visit intent",
  paymentIntent: "payment intent",
  locationRequest: "location request",
  followUpDate: "follow-up date",
};

export function ConversationReply({ leadId, leadPhone, leadName }: ConversationReplyProps) {
  const router = useRouter();
  const [customerMessage, setCustomerMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [reply, setReply] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [analysis, setAnalysis] = useState<AnalyzeOutput | null>(null);
  const [updatedFields, setUpdatedFields] = useState<string[]>([]);
  const [sent, setSent] = useState(false);

  const generate = useCallback(async () => {
    if (!customerMessage.trim()) {
      toast.error("Paste the customer's newest message.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(basePathUrl("/api/lead-assistant/reply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, customerMessage }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Generation failed");
      setReply(json.data.suggestedReply);
      setFollowUp(json.data.followUpMessage);
      setAnalysis(json.data);
      setUpdatedFields(json.updatedFields || []);
      setCustomerMessage("");
      setSent(false);
      router.refresh();
      toast.success("Reply generated and lead fields updated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to continue the conversation.");
    } finally {
      setLoading(false);
    }
  }, [customerMessage, leadId, router]);

  const copyReply = useCallback(async () => {
    await navigator.clipboard.writeText(reply);
    toast.success("Reply copied.");
  }, [reply]);

  const markSent = useCallback(async () => {
    if (!reply.trim() || sent) return;
    setRecording(true);
    try {
      const response = await fetch(basePathUrl("/api/lead-assistant/message"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, content: reply }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Could not record message");
      setSent(true);
      router.refresh();
      toast.success("Sent reply added to the conversation timeline.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record the sent reply.");
    } finally {
      setRecording(false);
    }
  }, [leadId, reply, router, sent]);

  return (
    <div className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-[#0b1f3a]">
        <Bot size={18} className="text-[#d4a72c]" />
        Continue WhatsApp conversation
      </h2>
      <p className="mb-4 text-sm leading-6 text-slate-500">
        Paste only {leadName ? `${leadName}'s` : "the customer's"} newest message. Claude reads the saved conversation, updates the lead, and drafts the next reply.
      </p>

      <textarea
        className="field min-h-28 resize-y text-sm leading-6"
        placeholder="Paste their newest WhatsApp message..."
        value={customerMessage}
        onChange={(event) => setCustomerMessage(event.target.value)}
      />
      <button className="btn btn-gold mt-3 w-full" disabled={loading} onClick={generate}>
        {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
        Update lead and generate reply
      </button>

      {reply ? (
        <div className="mt-5 space-y-4">
          {updatedFields.length ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-xs leading-5 text-blue-800">
              <strong>Lead updated:</strong> {updatedFields.map((field) => fieldLabels[field] || field).join(", ")}.
            </div>
          ) : null}

          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-green-800">
              <MessageCircle size={16} />Reply to send now
            </h3>
            <textarea className="field min-h-36 resize-y bg-white text-sm leading-6" value={reply} onChange={(event) => { setReply(event.target.value); setSent(false); }} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-outline text-sm" onClick={copyReply}><Copy size={14} />Copy</button>
              <a href={whatsappUrl(leadPhone, reply)} target="_blank" rel="noopener noreferrer" className="btn bg-green-600 text-sm text-white hover:bg-green-700"><MessageCircle size={14} />Open WhatsApp</a>
              <button className="btn btn-outline text-sm" disabled={recording || sent} onClick={markSent}>
                {recording ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {sent ? "Recorded as sent" : "Mark as sent"}
              </button>
            </div>
          </div>

          {analysis?.missingInformation.length ? (
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4 text-sm text-amber-900">
              <strong className="block">Still useful to learn</strong>
              <p className="mt-1 leading-6">{analysis.missingInformation.join(" • ")}</p>
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700"><Timer size={16} />If they go quiet</h3>
            <textarea className="field min-h-24 resize-y bg-white text-sm leading-6" value={followUp} onChange={(event) => setFollowUp(event.target.value)} />
            <button className="btn btn-outline mt-3 text-sm" onClick={async () => { await navigator.clipboard.writeText(followUp); toast.success("Follow-up copied."); }}><Copy size={14} />Copy follow-up</button>
          </div>

          <p className="text-xs leading-5 text-slate-400">The customer message and AI draft are already logged. Mark the edited reply as sent so the next turn uses the exact message you sent.</p>
        </div>
      ) : null}
    </div>
  );
}
