import { STATUS_STYLES } from "@/lib/constants";
import { cn } from "@/lib/utils";

export function StatusBadge({ status }: { status: string }) {
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset", STATUS_STYLES[status] || "bg-slate-50 text-slate-700 ring-slate-200")}>{status}</span>;
}
