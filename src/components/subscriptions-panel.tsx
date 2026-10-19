import { Plus } from "lucide-react";
import { saveSubscription, setSubscriptionStatus } from "@/app/actions";
import { StatusBadge } from "@/components/status-badge";
import type { MembershipPaymentInfo } from "@/lib/membership";
import { formatDate, formatRwf } from "@/lib/utils";

export type PanelSubscription = {
  id: string;
  name: string;
  label: string | null;
  packageId: string | null;
  packageName: string | null;
  status: string;
  startDate: Date;
  notes: string | null;
  lastPaymentDate: Date | null;
  totalPaid: number;
  info: MembershipPaymentInfo | null;
};

type PackageOption = { id: string; name: string };

function dateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function SubscriptionFields({ sub, packages }: { sub?: PanelSubscription; packages: PackageOption[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div><label className="label">Name</label><input className="field" name="label" defaultValue={sub?.label ?? ""} placeholder="e.g. Zuna Logistics" /></div>
      <div><label className="label">Plan</label><select className="field" name="packageId" defaultValue={sub?.packageId ?? ""}><option value="">Custom amount (billed monthly)</option>{packages.map((pkg) => <option value={pkg.id} key={pkg.id}>{pkg.name}</option>)}</select></div>
      <div><label className="label">Start date</label><input className="field" type="date" name="startDate" defaultValue={dateInput(sub?.startDate ?? new Date())} /></div>
      <div><label className="label">Notes</label><input className="field" name="notes" defaultValue={sub?.notes ?? ""} placeholder="TIN, contact, anything staff should know" /></div>
    </div>
  );
}

/**
 * Every subscription one person holds, each with its own plan, due date and
 * payment status. Plain server-action forms: nothing here needs client state.
 */
export function SubscriptionsPanel({ leadId, subscriptions, packages }: { leadId: string; subscriptions: PanelSubscription[]; packages: PackageOption[] }) {
  const active = subscriptions.filter((sub) => sub.status === "active");
  const cancelled = subscriptions.filter((sub) => sub.status !== "active");
  return (
    <section className="card p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-[#0b1f3a]">Subscriptions</h2>
          <p className="mt-1 text-sm text-slate-500">Each one renews and is reminded on its own due date.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{active.length} active</span>
      </div>

      <div className="space-y-3">
        {[...active, ...cancelled].map((sub) => (
          <div className={`rounded-xl border p-4 ${sub.status === "active" ? "border-slate-200" : "border-dashed border-slate-200 opacity-70"}`} key={sub.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-[#0b1f3a]">{sub.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">{sub.label ? `${sub.packageName ?? "Custom amount"} · ` : ""}Since {formatDate(sub.startDate)} · {formatRwf(sub.totalPaid)} paid</p>
              </div>
              {sub.status !== "active" ? <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Cancelled</span> : sub.info ? <StatusBadge status={sub.info.status} /> : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">Awaiting first payment</span>}
            </div>
            {sub.status === "active" && sub.info && (
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <p><span className="block text-xs text-slate-500">Last payment</span>{formatDate(sub.lastPaymentDate)}</p>
                <p><span className="block text-xs text-slate-500">Next payment</span>{formatDate(sub.info.nextPaymentDate)}</p>
                <p><span className="block text-xs text-slate-500">Due now</span><span className={sub.info.dueAmount > 0 ? "font-semibold text-rose-600" : ""}>{sub.info.dueAmount > 0 ? `${formatRwf(sub.info.dueAmount)}${sub.info.status === "Delayed Payment" ? ` · ${sub.info.daysUntilSuspension}d left` : ""}` : "Nothing"}</span></p>
              </div>
            )}
            {sub.notes && <p className="mt-2 text-xs text-slate-500">{sub.notes}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">Edit</summary>
              <form action={saveSubscription} className="mt-3 space-y-3">
                <input type="hidden" name="id" value={sub.id} />
                <input type="hidden" name="leadId" value={leadId} />
                <SubscriptionFields sub={sub} packages={packages} />
                <div className="flex justify-end"><button className="btn btn-primary">Save subscription</button></div>
              </form>
              <form action={setSubscriptionStatus} className="mt-2 flex justify-end">
                <input type="hidden" name="id" value={sub.id} />
                <input type="hidden" name="status" value={sub.status === "active" ? "cancelled" : "active"} />
                <button className="btn btn-outline min-h-9 text-xs">{sub.status === "active" ? "Cancel subscription" : "Reactivate subscription"}</button>
              </form>
            </details>
          </div>
        ))}
        {subscriptions.length === 0 && <p className="text-sm text-slate-500">No subscriptions yet. One is opened automatically when a renewing plan is paid, or add one below.</p>}
      </div>

      <details className="mt-4">
        <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-[#0b1f3a]"><Plus size={16} />Add subscription</summary>
        <form action={saveSubscription} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
          <input type="hidden" name="leadId" value={leadId} />
          <SubscriptionFields packages={packages} />
          <div className="flex justify-end"><button className="btn btn-primary">Add subscription</button></div>
        </form>
      </details>
    </section>
  );
}
