"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { commitmentTerms, LOYALTY, loyaltyTerms, overrideMonthlyTotal, terminateSubscription, termsVersion } from "@/lib/billing";
import { getMembershipPaymentStatus } from "@/lib/membership";
import { saleAmountWithVat } from "@/lib/pricing";
import { formatRwf } from "@/lib/utils";

/**
 * Staff-only billing changes: custom prices, the Loyalty Rate, terminations.
 * The proxy already answers 403 to any action call without a CRM session;
 * each action checks again so none of them can ever run unauthenticated.
 */
async function assertCrmAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySessionToken(token))) throw new Error("Forbidden");
}

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => v || null);
const base = z.object({
  subscriptionId: z.string().trim().min(1),
  changedBy: z.string().trim().min(1, "Say who is making this change").max(80),
  note: optionalText(1000),
});
const effective = z.object({
  effective: z.enum(["next", "date"]).default("next"),
  effectiveDate: z.coerce.date().optional(),
});
const overrideSchema = base.merge(effective).extend({
  amount: z.coerce.number().int().positive(),
  vatInclusive: z.boolean(),
  commitmentMonths: z.enum(["", "6", "12"]).transform((v) => (v ? Number(v) : null)),
  terms: optionalText(5000),
});

/** Form fields, with empty inputs dropped so optional ones read as missing. */
function read(formData: FormData) {
  return Object.fromEntries([...formData.entries()].filter(([, v]) => v !== ""));
}

function refresh(leadId: string) {
  ["/members", "/billing", `/leads/${leadId}`].forEach((path) => revalidatePath(path));
}

async function loadSubscription(subscriptionId: string) {
  const sub = await getDb().subscription.findUnique({
    where: { id: subscriptionId },
    include: { package: true, priceOverride: true, payments: { orderBy: { paymentDate: "desc" }, take: 1 } },
  });
  if (!sub) throw new Error("Subscription not found");
  return sub;
}

type LoadedSubscription = Awaited<ReturnType<typeof loadSubscription>>;

/** "Next billing cycle" is the subscription's next due date, or today if it has never been paid. */
function effectiveFrom(sub: LoadedSubscription, data: z.infer<typeof effective>) {
  if (data.effective === "date") {
    if (!data.effectiveDate) throw new Error("Pick the date the price starts");
    return data.effectiveDate;
  }
  const latest = sub.payments[0];
  return getMembershipPaymentStatus(sub.package, latest?.paymentDate, latest?.amount)?.nextPaymentDate ?? new Date();
}

async function writeOverride(
  sub: LoadedSubscription,
  data: { kind: string; amount: number; vatInclusive: boolean; effectiveFrom: Date; commitmentMonths: number | null; terms: string | null; note: string | null },
  changedBy: string,
) {
  const db = getDb();
  const oldAmount = sub.priceOverride ? overrideMonthlyTotal(sub.priceOverride) : sub.package ? saleAmountWithVat(sub.package.price) : null;
  const newAmount = overrideMonthlyTotal(data);
  const fields = { ...data, termsVersion: data.terms ? termsVersion(data.terms) : null };
  await db.$transaction([
    db.priceOverride.upsert({ where: { subscriptionId: sub.id }, create: { subscriptionId: sub.id, ...fields }, update: fields }),
    db.billingAuditLog.create({ data: { leadId: sub.leadId, subscriptionId: sub.id, action: "override_set", changedBy, oldAmount, newAmount, note: data.note } }),
    db.interaction.create({
      data: {
        leadId: sub.leadId,
        type: "note",
        content: `${data.kind === "loyalty" ? "Loyalty Rate" : "Custom price"} set: ${formatRwf(newAmount)}/month${data.commitmentMonths ? `, ${data.commitmentMonths}-month commitment` : ""} (by ${changedBy}).`,
      },
    }),
  ]);
  refresh(sub.leadId);
}

/** Sets or edits a subscription's custom monthly price. */
export async function saveOverride(formData: FormData) {
  await assertCrmAdmin();
  const data = overrideSchema.parse({
    ...read(formData),
    vatInclusive: formData.get("vatInclusive") === "on",
    commitmentMonths: formData.get("commitmentMonths") ?? "",
  });
  const sub = await loadSubscription(data.subscriptionId);
  const monthlyTotal = overrideMonthlyTotal(data);
  let terms = data.terms;
  if (data.commitmentMonths && !terms) {
    if (!sub.package) {
      throw new Error("A commitment needs the subscription's standard plan to work out the penalty. Set its plan, or write the terms yourself.");
    }
    terms = commitmentTerms({ label: "discounted", months: data.commitmentMonths, standardTotal: saleAmountWithVat(sub.package.price), monthlyTotal });
  }
  await writeOverride(
    sub,
    {
      kind: sub.priceOverride?.kind === "loyalty" && monthlyTotal === LOYALTY.monthlyTotal ? "loyalty" : "custom",
      amount: data.amount,
      vatInclusive: data.vatInclusive,
      effectiveFrom: effectiveFrom(sub, data),
      commitmentMonths: data.commitmentMonths,
      terms,
      note: data.note,
    },
    data.changedBy,
  );
}

/**
 * Moves a member onto the Loyalty Rate in one click, without the two-payment
 * rule the portal applies. A subscription with no plan is put on the monthly
 * Virtual Address plan, since that is the price the discount is measured from.
 */
export async function applyLoyaltyRate(formData: FormData) {
  await assertCrmAdmin();
  const data = base.merge(effective).parse(read(formData));
  const db = getDb();
  const pkg = await db.package.findUnique({ where: { slug: LOYALTY.packageSlug } });
  if (!pkg) throw new Error("The monthly Virtual Address package is missing");
  let sub = await loadSubscription(data.subscriptionId);
  if (sub.packageId && sub.packageId !== pkg.id) throw new Error("The Loyalty Rate only applies to the monthly Virtual Address plan");
  if (!sub.packageId) {
    await db.subscription.update({ where: { id: sub.id }, data: { packageId: pkg.id } });
    sub = await loadSubscription(sub.id);
  }
  await writeOverride(
    sub,
    {
      kind: "loyalty",
      amount: LOYALTY.monthlyTotal,
      vatInclusive: true,
      effectiveFrom: effectiveFrom(sub, data),
      commitmentMonths: LOYALTY.commitmentMonths,
      terms: loyaltyTerms(saleAmountWithVat(pkg.price)),
      note: data.note,
    },
    data.changedBy,
  );
}

/** Back to the plan's standard price from the next payment. */
export async function removeOverride(formData: FormData) {
  await assertCrmAdmin();
  const data = base.parse(read(formData));
  const sub = await loadSubscription(data.subscriptionId);
  if (!sub.priceOverride) return;
  const db = getDb();
  await db.$transaction([
    db.priceOverride.delete({ where: { subscriptionId: sub.id } }),
    db.billingAuditLog.create({
      data: {
        leadId: sub.leadId,
        subscriptionId: sub.id,
        action: "override_removed",
        changedBy: data.changedBy,
        oldAmount: overrideMonthlyTotal(sub.priceOverride),
        newAmount: sub.package ? saleAmountWithVat(sub.package.price) : null,
        note: data.note,
      },
    }),
    db.interaction.create({ data: { leadId: sub.leadId, type: "note", content: `Custom price removed; back to the standard price (by ${data.changedBy}).` } }),
  ]);
  refresh(sub.leadId);
}

/** Ends the subscription and records any early-termination penalty it owes. */
export async function terminateWithPenalty(formData: FormData) {
  await assertCrmAdmin();
  const data = base.parse(read(formData));
  const db = getDb();
  const { leadId } = await db.$transaction(async (tx) => {
    const result = await terminateSubscription(tx, data.subscriptionId, data.changedBy, data.note);
    await tx.interaction.create({
      data: { leadId: result.leadId, type: "note", content: `Subscription terminated by ${data.changedBy}.${result.penalty > 0 ? ` Early-termination penalty owed: ${formatRwf(result.penalty)}.` : ""}` },
    });
    return result;
  });
  refresh(leadId);
}

/** Clears the block on new purchases once the penalty has been received. */
export async function markPenaltyPaid(formData: FormData) {
  await assertCrmAdmin();
  const data = base.parse(read(formData));
  const db = getDb();
  const sub = await db.subscription.update({ where: { id: data.subscriptionId }, data: { penaltyPaidAt: new Date() } });
  await db.billingAuditLog.create({
    data: { leadId: sub.leadId, subscriptionId: sub.id, action: "penalty_paid", changedBy: data.changedBy, newAmount: sub.penaltyAmount, note: data.note },
  });
  refresh(sub.leadId);
}
