"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { addInteraction } from "@/app/actions";

export function NoteForm({ leadId }: { leadId: string }) {
  const [content, setContent] = useState(""); const [pending, startTransition] = useTransition();
  return <form className="flex flex-col gap-3 sm:flex-row" onSubmit={(event) => { event.preventDefault(); if (!content.trim()) return; startTransition(async () => { try { await addInteraction(leadId, content); setContent(""); toast.success("Note added"); } catch { toast.error("Could not add note"); } }); }}><textarea className="field min-h-20 flex-1" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Add a conversation note..." /><button className="btn btn-primary self-end" disabled={pending}>{pending ? "Adding..." : "Add note"}</button></form>;
}
