"use client";

import { Upload } from "lucide-react";
import { useActionState } from "react";
import { importAnnex } from "@/app/tax-actions";

/** Uploads a Sales_Ver_1.1.txt or Purchase_Ver_1.1.txt already filed on e-Tax. */
export function AnnexImport() {
  const [result, action, pending] = useActionState(importAnnex, null);
  return <form action={action} className="space-y-3">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <input aria-label="Annex file" className="field cursor-pointer file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold" type="file" name="file" accept=".txt,text/plain" required />
      <button className="btn btn-primary shrink-0" disabled={pending}><Upload size={16} />{pending ? "Importing..." : "Import annex"}</button>
    </div>
    {result && <div className={`rounded-xl p-3 text-sm ${result.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800"}`}>
      <p className="font-semibold">{result.message}</p>
      {result.errors.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5">{result.errors.map((error) => <li key={error}>{error}</li>)}</ul>}
    </div>}
  </form>;
}
