import { MessageCircle, MessageSquareText } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import { PageHeader } from "@/components/page-header";
import { getDb } from "@/lib/db";

export const metadata = { title: "Message Templates" };
export default async function TemplatesPage() {
  const templates = await getDb().messageTemplate.findMany({ orderBy: [{ category: "asc" }, { title: "asc" }] });
  return <><PageHeader eyebrow="WhatsApp toolkit" title="Message templates" description="Copy a prepared response, then personalize it in WhatsApp. Lead profiles replace {{name}} automatically." />
    <div className="grid gap-4 lg:grid-cols-2">{templates.map((template) => <article className="card flex flex-col p-5" key={template.id}><div className="mb-4 flex items-start justify-between gap-3"><div className="rounded-xl bg-[#fff5d8] p-2.5 text-[#9a7110]"><MessageSquareText size={20} /></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-600">{template.category}</span></div><h2 className="font-bold text-[#0b1f3a]">{template.title}</h2><div className="my-4 flex-1 whitespace-pre-line rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{template.body}</div><div className="flex gap-2"><CopyButton text={template.body.replaceAll("{{name}}", "there,")} /><span className="inline-flex items-center gap-1.5 text-xs text-slate-400"><MessageCircle size={14} />Use from any lead profile</span></div></article>)}</div>
  </>;
}
