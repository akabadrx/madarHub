"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Bot, Copy, MessageCircle, Loader2, Sparkles, Save, ChevronDown, ChevronUp, RotateCw, Timer } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { LEAD_TYPES, LEAD_STATUSES, INTERESTS } from "@/lib/constants";
import type { AnalyzeOutput } from "@/lib/lead-assistant-validation";
import { basePathUrl, whatsappUrl } from "@/lib/utils";

type EditableLead = AnalyzeOutput & {
  saveSnippet: boolean;
};

const INITIAL_STATE: EditableLead = {
  customerName: null,
  phone: null,
  latestMessage: null,
  languageDetected: "English",
  leadType: "Unknown",
  leadStatus: "New Lead",
  interest: null,
  suggestedPackage: null,
  budgetMentioned: null,
  numberOfPeople: null,
  requestedDate: null,
  requestedTime: null,
  visitIntent: false,
  paymentIntent: false,
  locationRequest: false,
  equipmentRequest: null,
  importantNotes: null,
  nextAction: "",
  followUpDate: null,
  suggestedReply: "",
  followUpMessage: "",
  confidenceScore: 0,
  saveSnippet: false,
};

const LEAD_TYPE_COLORS: Record<string, string> = {
  "General Coworking Lead": "bg-blue-50 text-blue-700 ring-blue-200",
  "Day Pass Lead": "bg-amber-50 text-amber-700 ring-amber-200",
  "Monthly Fixed Desk Lead": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Student Study Lead": "bg-violet-50 text-violet-700 ring-violet-200",
  "Meeting Room Lead": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Training Room Lead": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Private Office Lead": "bg-rose-50 text-rose-700 ring-rose-200",
  "Team Room Lead": "bg-rose-50 text-rose-700 ring-rose-200",
  "Location Request": "bg-orange-50 text-orange-700 ring-orange-200",
  "Equipment Question": "bg-slate-50 text-slate-700 ring-slate-200",
  "Follow Up Later": "bg-gray-50 text-gray-700 ring-gray-200",
  "Low Intent": "bg-gray-50 text-gray-600 ring-gray-200",
  "Unknown": "bg-gray-50 text-gray-600 ring-gray-200",
};

function ConfidenceBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-semibold text-slate-600 tabular-nums">{pct}%</span>
    </div>
  );
}

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
    </div>
  );
}

export default function LeadAssistantPage() {
  const [chat, setChat] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<EditableLead | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [regeneratingFollowUp, setRegeneratingFollowUp] = useState(false);

  const analyze = useCallback(async () => {
    if (chat.trim().length < 10) {
      toast.error("Paste at least 10 characters of the WhatsApp conversation.");
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch(basePathUrl("/api/lead-assistant/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Analysis failed");
      setResult({ ...INITIAL_STATE, ...json.data, saveSnippet: false });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to analyze lead.");
    } finally {
      setLoading(false);
    }
  }, [chat]);

  const saveLead = useCallback(async () => {
    if (!result) return;
    if (!result.phone || result.phone.trim().length < 7) {
      toast.error("Phone number is required to save a lead. Please edit the phone field.");
      return;
    }
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", result.customerName || "");
      formData.append("phone", result.phone);
      formData.append("source", "WhatsApp Direct");
      formData.append("interest", result.interest || "");
      formData.append("status", result.leadStatus);
      formData.append("notes", [
        result.importantNotes,
        result.nextAction ? `Next action: ${result.nextAction}` : null,
        result.budgetMentioned ? `Budget: ${result.budgetMentioned}` : null,
        result.numberOfPeople ? `People: ${result.numberOfPeople}` : null,
        result.requestedDate ? `Requested date: ${result.requestedDate}` : null,
        result.requestedTime ? `Requested time: ${result.requestedTime}` : null,
        result.equipmentRequest ? `Equipment: ${result.equipmentRequest}` : null,
        result.languageDetected ? `Language: ${result.languageDetected}` : null,
      ].filter(Boolean).join("\n") || "");
      if (result.saveSnippet && chat.trim()) {
        formData.append("rawWhatsappSnippet", chat);
      }
      if (result.followUpDate) {
        formData.append("followUpDate", result.followUpDate);
      }
      if (result.followUpMessage) {
        formData.append("followUpMessage", result.followUpMessage);
      }
      formData.append("aiSummary", `AI: ${result.leadType} | ${result.nextAction}`);
      formData.append("aiConfidence", String(result.confidenceScore));

      const res = await fetch(basePathUrl("/api/lead-assistant/save"), {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Save failed");
      toast.success("Lead saved!");
      if (json.id) {
        window.location.href = basePathUrl(`/leads/${json.id}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save lead.");
    } finally {
      setSaving(false);
    }
  }, [result, chat]);

  const copyReply = useCallback(() => {
    if (!result?.suggestedReply) return;
    navigator.clipboard.writeText(result.suggestedReply);
    toast.success("Reply copied!");
  }, [result]);

  const copyFollowUp = useCallback(() => {
    if (!result?.followUpMessage) return;
    navigator.clipboard.writeText(result.followUpMessage);
    toast.success("Follow-up message copied!");
  }, [result]);

  const regenerateFollowUp = useCallback(async () => {
    if (!result || chat.trim().length < 10) return;
    setRegeneratingFollowUp(true);
    try {
      const res = await fetch(basePathUrl("/api/lead-assistant/analyze"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat, followUpDate: result.followUpDate }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Regeneration failed");
      setResult((prev) => prev ? { ...prev, followUpMessage: json.data.followUpMessage } : prev);
      toast.success("Follow-up message regenerated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate follow-up message.");
    } finally {
      setRegeneratingFollowUp(false);
    }
  }, [result, chat]);

  const update = useCallback(<K extends keyof EditableLead>(key: K, value: EditableLead[K]) => {
    setResult((prev) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  if (!result) {
    return (
      <>
        <PageHeader eyebrow="AI Toolkit" title="WhatsApp Lead Assistant" description="Paste a WhatsApp conversation, and AI will extract the lead details, classify it, suggest the best package, and draft a reply." />
        <div className="card p-5 sm:p-7">
          <label className="label mb-2">Paste WhatsApp chat here</label>
          <textarea
            className="field min-h-52 resize-y text-sm leading-6 sm:min-h-64"
            placeholder={`Example:\n[10:32 AM] Customer: Hi, I saw your post about coworking space. How much is it for a day pass?\n[10:33 AM] Customer: I need a quiet place to work for a few days next week\n[10:35 AM] You: Welcome to Madar Hub! Our day pass is 10,000 RWF...\n\nPaste the full conversation below 👇`}
            value={chat}
            onChange={(e) => setChat(e.target.value)}
          />
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">The WhatsApp chat is processed locally and never stored unless you choose to save it.</p>
            <button className="btn btn-gold min-w-40" onClick={analyze} disabled={loading}>
              {loading ? <><Loader2 size={18} className="animate-spin" />Analyzing...</> : <><Sparkles size={18} />Analyze Lead</>}
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader eyebrow="AI Toolkit" title="WhatsApp Lead Assistant" description="Review the extracted lead details, edit if needed, then save or send the reply." />

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div className="card p-5 sm:p-7">
            <label className="label mb-2">Paste WhatsApp chat here</label>
            <textarea
              className="field min-h-28 resize-y text-sm leading-6"
              value={chat}
              onChange={(e) => setChat(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">Add more conversation bits above and re-analyze to get an updated reply.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-gold min-w-36" onClick={analyze} disabled={loading}>
                {loading ? <><Loader2 size={18} className="animate-spin" />Analyzing...</> : <><Sparkles size={18} />Re-analyze</>}
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-500">
                <input type="checkbox" className="h-4 w-4 rounded border-slate-300 accent-[#d4a72c]" checked={result.saveSnippet} onChange={(e) => update("saveSnippet", e.target.checked)} />
                Save pasted chat as note
              </label>
            </div>
          </div>

          <div className="card divide-y divide-slate-100">
            <div className="flex items-center justify-between p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-[#0b1f3a]"><Bot size={20} className="text-[#d4a72c]" />AI Extracted Lead</h2>
              <ConfidenceBar score={result.confidenceScore} />
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <FieldGroup label="Customer name"><input className="field" value={result.customerName || ""} onChange={(e) => update("customerName", e.target.value || null)} /></FieldGroup>
              <FieldGroup label="Phone *"><input className="field" inputMode="tel" value={result.phone || ""} onChange={(e) => update("phone", e.target.value || null)} placeholder="250 788 000 000" /></FieldGroup>
              <FieldGroup label="Lead type">
                <select className="field" value={result.leadType} onChange={(e) => update("leadType", e.target.value as AnalyzeOutput["leadType"])}>
                  {LEAD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Lead status">
                <select className="field border-[#d4a72c] bg-[#fffdf7] font-semibold" value={result.leadStatus} onChange={(e) => update("leadStatus", e.target.value as AnalyzeOutput["leadStatus"])}>
                  {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Interest">
                <select className="field" value={result.interest || ""} onChange={(e) => update("interest", e.target.value || null)}>
                  <option value="">Not specified</option>
                  {INTERESTS.map((i) => <option key={i} value={i}>{i}</option>)}
                </select>
              </FieldGroup>
              <FieldGroup label="Suggested package"><input className="field" value={result.suggestedPackage || ""} onChange={(e) => update("suggestedPackage", e.target.value || null)} /></FieldGroup>
              <FieldGroup label="Budget mentioned"><input className="field" value={result.budgetMentioned || ""} onChange={(e) => update("budgetMentioned", e.target.value || null)} /></FieldGroup>
              <FieldGroup label="Number of people"><input className="field" type="number" min="1" value={result.numberOfPeople ?? ""} onChange={(e) => update("numberOfPeople", e.target.value ? Number(e.target.value) : null)} /></FieldGroup>
              <FieldGroup label="Requested date"><input className="field" value={result.requestedDate || ""} onChange={(e) => update("requestedDate", e.target.value || null)} /></FieldGroup>
              <FieldGroup label="Requested time"><input className="field" value={result.requestedTime || ""} onChange={(e) => update("requestedTime", e.target.value || null)} /></FieldGroup>
              <FieldGroup label="Language detected"><input className="field" value={result.languageDetected} onChange={(e) => update("languageDetected", e.target.value)} /></FieldGroup>
              <FieldGroup label="Equipment request"><input className="field" value={result.equipmentRequest || ""} onChange={(e) => update("equipmentRequest", e.target.value || null)} /></FieldGroup>
              <FieldGroup label="Next action"><input className="field font-semibold" value={result.nextAction} onChange={(e) => update("nextAction", e.target.value)} /></FieldGroup>
              <FieldGroup label="Follow-up date"><input className="field" type="datetime-local" value={result.followUpDate || ""} onChange={(e) => update("followUpDate", e.target.value || null)} /></FieldGroup>
              <FieldGroup label="Important notes"><textarea className="field min-h-20 resize-y" value={result.importantNotes || ""} onChange={(e) => update("importantNotes", e.target.value || null)} /></FieldGroup>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-[#0b1f3a]"><Sparkles size={18} className="text-[#d4a72c]" />Lead summary</h3>
            <div className="space-y-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Type:</span>
                <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${LEAD_TYPE_COLORS[result.leadType] || "bg-slate-50 text-slate-700 ring-slate-200"}`}>{result.leadType}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-slate-500">Status:</span>
                <StatusBadge status={result.leadStatus} />
              </div>
              {result.suggestedPackage && (
                <div><span className="text-slate-500">Suggested package:</span><p className="mt-0.5 font-semibold text-[#0b1f3a]">{result.suggestedPackage}</p></div>
              )}
              {result.nextAction && (
                <div><span className="text-slate-500">Next action:</span><p className="mt-0.5 font-semibold text-[#0b1f3a]">{result.nextAction}</p></div>
              )}
              <div className="flex flex-wrap gap-2">
                {result.visitIntent && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200">Visit intent</span>}
                {result.paymentIntent && <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 ring-1 ring-inset ring-blue-200">Payment intent</span>}
                {result.locationRequest && <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700 ring-1 ring-inset ring-orange-200">Location request</span>}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-[#0b1f3a]"><MessageCircle size={18} className="text-green-600" />Suggested WhatsApp reply</h3>
            <textarea
              className="field min-h-36 resize-y text-sm leading-6"
              value={result.suggestedReply}
              onChange={(e) => update("suggestedReply", e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-outline" type="button" onClick={copyReply}><Copy size={16} />Copy reply</button>
              {result.phone && (
                <a href={whatsappUrl(result.phone, result.suggestedReply)} target="_blank" rel="noopener noreferrer" className="btn bg-green-600 text-white hover:bg-green-700">
                  <MessageCircle size={16} />Send on WhatsApp
                </a>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="mb-3 flex items-center gap-2 font-bold text-[#0b1f3a]"><Timer size={18} className="text-amber-500" />Follow-up message</h3>
            <p className="mb-2 text-xs text-slate-400">Generated based on the selected follow-up date. Copy and send when the time comes.</p>
            <textarea
              className="field min-h-28 resize-y text-sm leading-6"
              value={result.followUpMessage}
              onChange={(e) => update("followUpMessage", e.target.value)}
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-outline" type="button" onClick={copyFollowUp}><Copy size={16} />Copy follow-up</button>
              {result.phone && result.followUpMessage && (
                <a href={whatsappUrl(result.phone, result.followUpMessage)} target="_blank" rel="noopener noreferrer" className="btn bg-green-600 text-white hover:bg-green-700">
                  <MessageCircle size={16} />Send on WhatsApp
                </a>
              )}
              {result.followUpDate && (
                <button className="btn btn-outline border-amber-400 text-amber-600 hover:bg-amber-50" type="button" onClick={regenerateFollowUp} disabled={regeneratingFollowUp}>
                  {regeneratingFollowUp ? <Loader2 size={16} className="animate-spin" /> : <RotateCw size={16} />}
                  Regenerate
                </button>
              )}
            </div>
          </div>

          <button className="btn btn-primary w-full" onClick={saveLead} disabled={saving}>
            {saving ? <><Loader2 size={18} className="animate-spin" />Saving...</> : <><Save size={18} />Save Lead</>}
          </button>

          <button className="text-sm text-slate-400 hover:text-slate-600" onClick={() => setShowRaw(!showRaw)}>
            {showRaw ? <><ChevronUp size={14} />Hide raw data</> : <><ChevronDown size={14} />Show raw data</>}
          </button>
          {showRaw && (
            <pre className="card overflow-auto p-4 text-xs leading-5 text-slate-500">{JSON.stringify(result, null, 2)}</pre>
          )}
        </div>
      </div>
    </>
  );
}