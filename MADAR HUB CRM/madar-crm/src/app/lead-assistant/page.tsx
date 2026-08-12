"use client";

import { useCallback, useMemo, useState } from "react";
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Loader2,
  MessageCircle,
  PackageCheck,
  Save,
  Send,
  Sparkles,
  Timer,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { INTERESTS, LEAD_STATUSES, LEAD_TYPES } from "@/lib/constants";
import type { AnalyzeOutput } from "@/lib/lead-assistant-validation";
import { basePathUrl, formatRwf, whatsappUrl } from "@/lib/utils";

interface PackageOption {
  id: string;
  slug: string;
  name: string;
  price: number;
  billingType: string;
  description: string | null;
}

interface ConversationTurn {
  role: "customer" | "assistant";
  content: string;
}

const INITIAL_STATE: AnalyzeOutput = {
  customerName: null,
  phone: null,
  latestMessage: null,
  languageDetected: "English",
  leadType: "Unknown",
  leadStatus: "New Lead",
  interest: null,
  suggestedPackageSlug: null,
  suggestedPackageReason: null,
  budgetMentioned: null,
  numberOfPeople: null,
  requestedDate: null,
  requestedTime: null,
  visitIntent: false,
  paymentIntent: false,
  locationRequest: false,
  equipmentRequest: null,
  importantNotes: null,
  conversationSummary: "",
  missingInformation: [],
  nextAction: "",
  followUpDate: null,
  suggestedReply: "",
  followUpMessage: "",
  confidenceScore: 0,
};

function FieldGroup({ label, important, children }: { label: string; important?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        {label}
        {important ? <span className="text-[#b9890d]">• important</span> : null}
      </label>
      {children}
    </div>
  );
}

function Confidence({ score }: { score: number }) {
  const value = Math.round(score * 100);
  return (
    <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${value >= 70 ? "bg-emerald-500" : value >= 45 ? "bg-amber-500" : "bg-red-400"}`} style={{ width: `${value}%` }} />
      </div>
      {value}% confident
    </div>
  );
}

export default function LeadAssistantPage() {
  const [initialTranscript, setInitialTranscript] = useState("");
  const [fullTranscript, setFullTranscript] = useState("");
  const [nextCustomerMessage, setNextCustomerMessage] = useState("");
  const [turns, setTurns] = useState<ConversationTurn[]>([]);
  const [result, setResult] = useState<AnalyzeOutput | null>(null);
  const [packages, setPackages] = useState<PackageOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);

  const selectedPackage = useMemo(
    () => packages.find((pkg) => pkg.slug === result?.suggestedPackageSlug) || null,
    [packages, result?.suggestedPackageSlug],
  );

  const requestAnalysis = useCallback(async (chat: string, previousAnalysis?: AnalyzeOutput) => {
    setLoading(true);
    try {
      const response = await fetch(basePathUrl("/api/lead-assistant/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat, previousAnalysis }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Analysis failed");
      setResult({ ...INITIAL_STATE, ...json.data });
      setPackages(json.packages || []);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to analyze the conversation.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeInitial = useCallback(async () => {
    const transcript = initialTranscript.trim();
    if (transcript.length < 10) {
      toast.error("Paste at least 10 characters of the WhatsApp conversation.");
      return;
    }
    if (await requestAnalysis(transcript)) {
      setFullTranscript(transcript);
      setTurns([]);
    }
  }, [initialTranscript, requestAnalysis]);

  const continueConversation = useCallback(async () => {
    if (!result) return;
    const customerMessage = nextCustomerMessage.trim();
    if (!customerMessage) {
      toast.error("Paste the customer's newest reply first.");
      return;
    }
    const assistantReply = result.suggestedReply.trim();
    const nextTranscript = [
      fullTranscript,
      assistantReply ? `Madar Hub:\n${assistantReply}` : null,
      `Customer:\n${customerMessage}`,
    ].filter(Boolean).join("\n\n");
    if (await requestAnalysis(nextTranscript, result)) {
      setTurns((current) => [
        ...current,
        ...(assistantReply ? [{ role: "assistant" as const, content: assistantReply }] : []),
        { role: "customer", content: customerMessage },
      ]);
      setFullTranscript(nextTranscript);
      setNextCustomerMessage("");
      toast.success("Conversation analyzed and lead fields updated.");
    }
  }, [fullTranscript, nextCustomerMessage, requestAnalysis, result]);

  const update = useCallback(<K extends keyof AnalyzeOutput>(key: K, value: AnalyzeOutput[K]) => {
    setResult((current) => current ? { ...current, [key]: value } : current);
  }, []);

  const saveLead = useCallback(async () => {
    if (!result) return;
    if (!result.phone || result.phone.trim().length < 7) {
      toast.error("Add the lead's phone number before saving.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(basePathUrl("/api/lead-assistant/save"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: result, initialTranscript, fullTranscript, conversationTurns: turns }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      toast.success("Lead and conversation saved.");
      window.location.href = basePathUrl(`/leads/${json.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  }, [fullTranscript, initialTranscript, result, turns]);

  const copy = useCallback(async (text: string, label: string) => {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copied.`);
  }, []);

  if (!result) {
    return (
      <>
        <PageHeader
          eyebrow="AI sales workspace"
          title="WhatsApp Lead Assistant"
          description="Paste the conversation once. Claude will extract the lead, choose from the live CRM packages, and draft the next contextual reply."
        />
        <div className="card p-5 sm:p-7">
          <div className="mb-4 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
            <Bot className="mt-0.5 shrink-0" size={19} />
            <p>Include both sides of the chat when possible. After the first analysis, you can paste each new customer reply below the generated reply and continue the same conversation.</p>
          </div>
          <label className="label mb-2">WhatsApp conversation</label>
          <textarea
            className="field min-h-64 resize-y text-sm leading-6"
            placeholder={`Customer: Hi, I need a room for a training next Thursday.\nMadar Hub: How many people will attend?\nCustomer: Around 18 people for the full day.`}
            value={initialTranscript}
            onChange={(event) => setInitialTranscript(event.target.value)}
          />
          <div className="mt-4 flex justify-end">
            <button className="btn btn-gold min-w-44" onClick={analyzeInitial} disabled={loading}>
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
              Analyze conversation
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="AI sales workspace"
        title="WhatsApp Lead Assistant"
        description="Review the live lead profile, use the reply, then paste the customer's next message to continue."
      />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-5">
          <section className="card overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
              <h2 className="flex items-center gap-2 font-bold text-[#0b1f3a]"><UserRound size={19} className="text-[#d4a72c]" />Important lead fields</h2>
              <Confidence score={result.confidenceScore} />
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <FieldGroup label="Customer name" important><input className="field" value={result.customerName || ""} onChange={(event) => update("customerName", event.target.value || null)} /></FieldGroup>
              <FieldGroup label="Phone" important><input className="field" inputMode="tel" placeholder="250 783 000 000" value={result.phone || ""} onChange={(event) => update("phone", event.target.value || null)} /></FieldGroup>
              <FieldGroup label="Lead type"><select className="field" value={result.leadType} onChange={(event) => update("leadType", event.target.value as AnalyzeOutput["leadType"])}>{LEAD_TYPES.map((item) => <option key={item}>{item}</option>)}</select></FieldGroup>
              <FieldGroup label="Lead status" important><select className="field border-[#d4a72c] bg-[#fffdf7] font-semibold" value={result.leadStatus} onChange={(event) => update("leadStatus", event.target.value as AnalyzeOutput["leadStatus"])}>{LEAD_STATUSES.map((item) => <option key={item}>{item}</option>)}</select></FieldGroup>
              <FieldGroup label="Interest" important><select className="field" value={result.interest || ""} onChange={(event) => update("interest", event.target.value || null)}><option value="">Not clear yet</option>{INTERESTS.map((item) => <option key={item}>{item}</option>)}</select></FieldGroup>
              <FieldGroup label="Language"><input className="field" value={result.languageDetected} onChange={(event) => update("languageDetected", event.target.value)} /></FieldGroup>
              <FieldGroup label="Number of people"><input className="field" type="number" min="1" value={result.numberOfPeople ?? ""} onChange={(event) => update("numberOfPeople", event.target.value ? Number(event.target.value) : null)} /></FieldGroup>
              <FieldGroup label="Budget mentioned"><input className="field" value={result.budgetMentioned || ""} onChange={(event) => update("budgetMentioned", event.target.value || null)} /></FieldGroup>
              <FieldGroup label="Requested date" important><input className="field" value={result.requestedDate || ""} onChange={(event) => update("requestedDate", event.target.value || null)} /></FieldGroup>
              <FieldGroup label="Requested time"><input className="field" value={result.requestedTime || ""} onChange={(event) => update("requestedTime", event.target.value || null)} /></FieldGroup>
              <FieldGroup label="Equipment / setup"><input className="field" value={result.equipmentRequest || ""} onChange={(event) => update("equipmentRequest", event.target.value || null)} /></FieldGroup>
              <FieldGroup label="Follow-up date"><input className="field" type="datetime-local" value={result.followUpDate || ""} onChange={(event) => update("followUpDate", event.target.value || null)} /></FieldGroup>
              <div className="sm:col-span-2"><FieldGroup label="Important notes"><textarea className="field min-h-24 resize-y" value={result.importantNotes || ""} onChange={(event) => update("importantNotes", event.target.value || null)} /></FieldGroup></div>
              <div className="sm:col-span-2"><FieldGroup label="Next action" important><input className="field font-semibold" value={result.nextAction} onChange={(event) => update("nextAction", event.target.value)} /></FieldGroup></div>
            </div>
          </section>

          <section className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold text-[#0b1f3a]"><Bot size={19} className="text-[#d4a72c]" />Conversation intelligence</h2>
              <StatusBadge status={result.leadStatus} />
            </div>
            <p className="text-sm leading-6 text-slate-700">{result.conversationSummary}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {result.visitIntent ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">Visit intent</span> : null}
              {result.paymentIntent ? <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Payment intent</span> : null}
              {result.locationRequest ? <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">Needs location</span> : null}
            </div>
            <button className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600" onClick={() => setShowTranscript((value) => !value)}>
              {showTranscript ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showTranscript ? "Hide" : "Show"} full conversation
            </button>
            {showTranscript ? <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600">{fullTranscript}</pre> : null}
          </section>
        </div>

        <aside className="space-y-5">
          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-[#0b1f3a]"><PackageCheck size={19} className="text-[#d4a72c]" />Suggested package</h2>
            <select className="field font-semibold" value={result.suggestedPackageSlug || ""} onChange={(event) => update("suggestedPackageSlug", event.target.value || null)}>
              <option value="">Need more information</option>
              {packages.map((pkg) => <option value={pkg.slug} key={pkg.slug}>{pkg.name} — {formatRwf(pkg.price)} + VAT</option>)}
            </select>
            {selectedPackage ? <p className="mt-3 text-sm leading-6 text-slate-600">{selectedPackage.description}</p> : null}
            {result.suggestedPackageReason ? <p className="mt-3 rounded-xl bg-[#fffaf0] p-3 text-sm leading-6 text-[#76570b]"><strong>Why:</strong> {result.suggestedPackageReason}</p> : null}
          </section>

          <section className="card p-5">
            <h2 className="mb-3 flex items-center gap-2 font-bold text-[#0b1f3a]"><AlertCircle size={18} className="text-amber-500" />Still useful to ask</h2>
            {result.missingInformation.length ? (
              <ul className="space-y-2 text-sm text-slate-600">{result.missingInformation.map((item) => <li className="flex gap-2" key={item}><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />{item}</li>)}</ul>
            ) : <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={17} />The important details are covered.</p>}
          </section>

          <section className="card border-green-100 p-5">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-[#0b1f3a]"><MessageCircle size={19} className="text-green-600" />Reply to send now</h2>
            <p className="mb-3 text-xs leading-5 text-slate-500">Edit this if needed. When the customer responds, paste their new message below; the assistant will carry this reply into the conversation.</p>
            <textarea className="field min-h-40 resize-y text-sm leading-6" value={result.suggestedReply} onChange={(event) => update("suggestedReply", event.target.value)} />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-outline" onClick={() => copy(result.suggestedReply, "Reply")}><Copy size={15} />Copy</button>
              {result.phone ? <a className="btn bg-green-600 text-white hover:bg-green-700" href={whatsappUrl(result.phone, result.suggestedReply)} target="_blank" rel="noreferrer"><MessageCircle size={15} />Open WhatsApp</a> : null}
            </div>

            <div className="my-5 border-t border-slate-100" />
            <label className="label">Paste the customer&apos;s next reply</label>
            <textarea className="field min-h-28 resize-y text-sm leading-6" placeholder="Paste only their newest reply here..." value={nextCustomerMessage} onChange={(event) => setNextCustomerMessage(event.target.value)} />
            <button className="btn btn-gold mt-3 w-full" onClick={continueConversation} disabled={loading}>
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}
              Add turn and update lead
            </button>
          </section>

          <section className="card p-5">
            <h2 className="mb-2 flex items-center gap-2 font-bold text-[#0b1f3a]"><Timer size={18} className="text-amber-500" />If they go quiet</h2>
            <textarea className="field min-h-28 resize-y text-sm leading-6" value={result.followUpMessage} onChange={(event) => update("followUpMessage", event.target.value)} />
            <button className="btn btn-outline mt-3" onClick={() => copy(result.followUpMessage, "Follow-up")}><Copy size={15} />Copy follow-up</button>
          </section>

          <button className="btn btn-primary w-full" onClick={saveLead} disabled={saving}>
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            Save lead and conversation
          </button>
        </aside>
      </div>
    </>
  );
}
