import { applyLoyaltyRate, markPenaltyPaid, removeOverride, saveOverride, terminateWithPenalty } from "@/app/billing-actions";
import type { SubscriptionBilling } from "@/lib/billing";
import { LOYALTY } from "@/lib/billing";
import { formatDate, formatRwf } from "@/lib/utils";

export type BillingRow = {
  id: string;
  name: string;
  status: string;
  terminatedAt: Date | null;
  penaltyAmount: number | null;
  penaltyPaidAt: Date | null;
  billing: SubscriptionBilling;
};

export type AuditRow = {
  id: string;
  action: string;
  changedBy: string;
  oldAmount: number | null;
  newAmount: number | null;
  note: string | null;
  createdAt: Date;
  subscriptionName: string | null;
};

const ACTION_LABEL: Record<string, string> = {
  override_set: "Price set",
  override_removed: "Price removed",
  loyalty_accepted: "Loyalty Rate taken up",
  terms_accepted: "Terms accepted",
  terminated: "Terminated",
  penalty_paid: "Penalty paid",
};

function ChangedBy() {
  return (
    <div>
      <label className="label">Changed by *</label>
      <input className="field" name="changedBy" required maxLength={80} placeholder="Your name" />
    </div>
  );
}

function Note() {
  return (
    <div>
      <label className="label">Internal note</label>
      <input className="field" name="note" maxLength={1000} />
    </div>
  );
}

function EffectiveFields() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Effective from</label>
        <select className="field" name="effective" defaultValue="next">
          <option value="next">Next billing cycle</option>
          <option value="date">The date below</option>
        </select>
      </div>
      <div>
        <label className="label">Date (if picked)</label>
        <input className="field" type="date" name="effectiveDate" />
      </div>
    </div>
  );
}

/**
 * Per-subscription custom prices, the Loyalty Rate, terminations and the
 * audit trail. Admin-only: the CRM has one shared login, so whoever can see
 * this page is an admin, and every action re-checks the session.
 */
export function BillingPanel({ rows, audit }: { rows: BillingRow[]; audit: AuditRow[] }) {
  if (rows.length === 0) return null;
  return (
    <section className="card p-5">
      <div className="mb-4">
        <h2 className="font-bold text-[#0b1f3a]">Billing</h2>
        <p className="mt-1 text-sm text-slate-500">
          A custom monthly price replaces the plan&apos;s price in checkout, reminders and receipts until you change or remove it.
        </p>
      </div>

      <div className="space-y-3">
        {rows.map(({ id, name, status, terminatedAt, penaltyAmount, penaltyPaidAt, billing }) => {
          const o = billing.override;
          const active = status === "active";
          return (
            <div className="rounded-xl border border-slate-200 p-4" key={id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-[#0b1f3a]">{name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {o
                      ? `${o.kind === "loyalty" ? "Loyalty Rate" : "Custom price"}: ${formatRwf(o.monthlyTotal)}/month incl. VAT, from ${formatDate(o.effectiveFrom)}`
                      : billing.standardTotal !== null
                        ? `Standard price: ${formatRwf(billing.standardTotal)}/month incl. VAT`
                        : "Custom amount (no plan)"}
                  </p>
                </div>
                {o ? (
                  <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
                    Custom price: {o.monthlyTotal.toLocaleString("en-RW")}
                  </span>
                ) : null}
              </div>

              {o?.commitmentMonths ? (
                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <p>
                    <span className="block text-xs text-slate-500">Commitment</span>
                    {o.monthsPaid > 0
                      ? `Month ${Math.min(o.monthsPaid, o.commitmentMonths)} of ${o.commitmentMonths}, ends ${formatDate(o.endDate)}`
                      : `${o.commitmentMonths} months, starts with the first payment`}
                  </p>
                  <p>
                    <span className="block text-xs text-slate-500">Penalty if cancelled today</span>
                    {formatRwf(o.penaltyIfCancelledToday)}
                  </p>
                  <p>
                    <span className="block text-xs text-slate-500">Member accepted terms</span>
                    {o.termsAccepted ? "Yes" : <span className="font-semibold text-rose-600">Not yet: payments blocked until they do</span>}
                  </p>
                </div>
              ) : null}

              {terminatedAt ? (
                <div className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">
                  Terminated {formatDate(terminatedAt)}.{" "}
                  {penaltyAmount ? (
                    penaltyPaidAt ? (
                      `Penalty of ${formatRwf(penaltyAmount)} paid ${formatDate(penaltyPaidAt)}.`
                    ) : (
                      <>
                        Penalty owed: <strong>{formatRwf(penaltyAmount)}</strong>. New purchases are blocked until it is paid.
                        <form action={markPenaltyPaid} className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                          <input type="hidden" name="subscriptionId" value={id} />
                          <ChangedBy />
                          <Note />
                          <button className="btn btn-outline">Mark penalty paid</button>
                        </form>
                        <p className="mt-2 text-xs">Record the money in Payment history and issue its EBM receipt first.</p>
                      </>
                    )
                  ) : (
                    "No penalty owed."
                  )}
                </div>
              ) : null}

              {active ? (
                <div className="mt-3 space-y-2">
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">
                      {o ? "Edit custom price" : "Set custom price"}
                    </summary>
                    <form action={saveOverride} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
                      <input type="hidden" name="subscriptionId" value={id} />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">Monthly amount (RWF) *</label>
                          <input className="field" type="number" min="1" name="amount" required defaultValue={o?.amount ?? ""} />
                        </div>
                        <label className="mt-6 flex items-center gap-2 text-sm">
                          <input type="checkbox" name="vatInclusive" defaultChecked={o?.vatInclusive ?? true} />
                          VAT inclusive (the amount is the total)
                        </label>
                      </div>
                      <EffectiveFields />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label className="label">Commitment</label>
                          <select className="field" name="commitmentMonths" defaultValue={o?.commitmentMonths ? String(o.commitmentMonths) : ""}>
                            <option value="">None</option>
                            <option value="6">6 months</option>
                            <option value="12">12 months</option>
                          </select>
                        </div>
                        <Note />
                      </div>
                      <div>
                        <label className="label">Customer-facing terms (optional)</label>
                        <textarea className="field min-h-24" name="terms" maxLength={5000} defaultValue={o?.kind === "custom" ? (o.terms ?? "") : ""} placeholder="Left empty with a commitment, the standard early-termination terms are used." />
                      </div>
                      <ChangedBy />
                      <div className="flex justify-end"><button className="btn btn-primary">Save custom price</button></div>
                    </form>
                  </details>

                  {o?.kind !== "loyalty" ? (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">Apply Loyalty Rate</summary>
                      <form action={applyLoyaltyRate} className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4">
                        <input type="hidden" name="subscriptionId" value={id} />
                        <p className="text-sm text-slate-600">
                          {formatRwf(LOYALTY.monthlyTotal)}/month VAT inclusive, {LOYALTY.commitmentMonths}-month commitment, standard early-termination terms. Skips the two-payment rule. The member accepts the terms on the portal before their next payment.
                        </p>
                        <EffectiveFields />
                        <div className="grid gap-3 sm:grid-cols-2"><ChangedBy /><Note /></div>
                        <div className="flex justify-end"><button className="btn btn-gold">Apply Loyalty Rate</button></div>
                      </form>
                    </details>
                  ) : null}

                  {o ? (
                    <details>
                      <summary className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-700">Remove override</summary>
                      <form action={removeOverride} className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                        <input type="hidden" name="subscriptionId" value={id} />
                        <ChangedBy />
                        <Note />
                        <button className="btn btn-outline">Remove override</button>
                      </form>
                    </details>
                  ) : null}

                  <details>
                    <summary className="cursor-pointer text-xs font-semibold text-rose-600 hover:text-rose-700">Mark as terminated</summary>
                    <form action={terminateWithPenalty} className="mt-3 space-y-3 rounded-xl bg-rose-50 p-4">
                      <input type="hidden" name="subscriptionId" value={id} />
                      <p className="text-sm text-rose-800">
                        Cancels the subscription
                        {o?.penaltyIfCancelledToday ? ` and records a penalty of ${formatRwf(o.penaltyIfCancelledToday)}` : ""}. The company must amend its RDB address within {LOYALTY.addressAmendmentDays} days.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2"><ChangedBy /><Note /></div>
                      <div className="flex justify-end"><button className="btn bg-rose-600 text-white">Terminate</button></div>
                    </form>
                  </details>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {audit.length > 0 ? (
        <div className="mt-5 table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>When</th><th>Change</th><th>Subscription</th><th>By</th><th>Old</th><th>New</th><th>Note</th></tr>
            </thead>
            <tbody>
              {audit.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.createdAt, true)}</td>
                  <td>{ACTION_LABEL[row.action] ?? row.action}</td>
                  <td>{row.subscriptionName ?? "—"}</td>
                  <td>{row.changedBy}</td>
                  <td>{row.oldAmount !== null ? formatRwf(row.oldAmount) : "—"}</td>
                  <td>{row.newAmount !== null ? formatRwf(row.newAmount) : "—"}</td>
                  <td>{row.note ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
