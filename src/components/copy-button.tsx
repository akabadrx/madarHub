"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return <button className="btn btn-outline" type="button" onClick={async () => { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1600); }}>{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : label}</button>;
}
