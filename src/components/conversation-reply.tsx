"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { Bot, Copy, Loader2, MessageCircle, RotateCw, Send, Timer } from "lucide-react";
import { basePathUrl, whatsappUrl } from "@/lib/utils";

interface ConversationReplyProps {
  leadId: string;
  leadPhone: string;
  leadName?: string | null;
}

export function ConversationReply({ leadId, leadPhone, leadName }: ConversationReplyProps) {
  const [chat, setChat] = useState("");
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState("");
  const [followUp, setFollowUp] = useState("");

  const generate = useCallback(async () => {
    if (chat.trim().length < 10) {
      toast.error("Paste at least 10 characters of the conversation.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(basePathUrl("/api/lead-assistant/reply"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId, chat }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || "Generation failed");
      setReply(json.data.suggestedReply);
      setFollowUp(json.data.followUpMessage);
      toast.success("Reply generated!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate reply.");
    } finally {
      setLoading(false);
    }
  }, [chat, leadId]);

  const copyText = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  }, []);

  return (
    <div className="card p-5">
      <h2 className="mb-1 flex items-center gap-2 font-bold text-[#0b1f3a]">
        <Bot size={18} className="text-[#d4a72c]" />
        Continue Conversation
      </h2>
      <p className="mb-4 text-sm text-slate-500">
        Paste new WhatsApp messages {leadName ? `with ${leadName}` : "from this lead"} and AI will draft a contextual reply.
      </p>

      <textarea
        className="field min-h-24 resize-y text-sm leading-6"
        placeholder="Paste the latest WhatsApp conversation bits here..."
        value={chat}
        onChange={(e) => setChat(e.target.value)}
      />

      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn btn-gold min-w-32" disabled={loading} onClick={generate}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          Generate Reply
        </button>
        {reply ? (
          <button className="btn btn-outline" onClick={() => { setChat(""); setReply(""); setFollowUp(""); }}>
            <RotateCw size={16} />Clear
          </button>
        ) : null}
      </div>

      {reply ? (
        <div className="mt-5 space-y-4">
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-green-800">
              <MessageCircle size={16} />Reply (copy & paste now)
            </h3>
            <p className="mb-3 whitespace-pre-line text-sm leading-6 text-slate-700">{reply}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-outline text-sm" onClick={() => copyText(reply, "Reply")}>
                <Copy size={14} />Copy reply
              </button>
              <a href={whatsappUrl(leadPhone, reply)} target="_blank" rel="noopener noreferrer" className="btn bg-green-600 text-white hover:bg-green-700 text-sm">
                <MessageCircle size={14} />Send
              </a>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <h3 className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-800">
              <Timer size={16} />Follow-up message (send in 2-3 days)
            </h3>
            <p className="mb-3 whitespace-pre-line text-sm leading-6 text-slate-700">{followUp}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-outline text-sm" onClick={() => copyText(followUp, "Follow-up")}>
                <Copy size={14} />Copy follow-up
              </button>
              <a href={whatsappUrl(leadPhone, followUp)} target="_blank" rel="noopener noreferrer" className="btn bg-green-600 text-white hover:bg-green-700 text-sm">
                <MessageCircle size={14} />Send
              </a>
            </div>
          </div>

          <p className="text-xs text-slate-400">The conversation you pasted is saved in the lead&apos;s timeline.</p>
        </div>
      ) : null}
    </div>
  );
}
