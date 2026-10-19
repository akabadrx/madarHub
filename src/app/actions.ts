"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { leadSchema, paymentSchema, subscriptionSchema, visitSchema } from "@/lib/validation";
import { VISIT_STATUSES } from "@/lib/constants";
import { isRecurringBillingType } from "@/lib/membership";
import { AmbiguousSubscriptionError, resolvePaymentSubscription, subscriptionName } from "@/lib/subscriptions";

function refreshCrm() {
  ["/", "/leads", "/members", "/follow-ups", "/visits", "/payments", "/packages", "/lead-assistant"].forEach((path) => revalidatePath(path));
}

export async function saveLead(input: unknown) {
  const data = leadSchema.parse(input);
  const db = getDb();
  const payload = {
    name: data.name || null,
    phone: data.phone,
    email: data.email ? data.email.trim().toLowerCase() : null,
    source: data.source,
    interest: data.interest || null,
    suggestedPackageId: data.suggestedPackageId || null,
    status: data.status,
    visitDate: data.visitDate,
    followUpDate: data.followUpDate,
    paymentStatus: data.paymentStatus || "Pending",
    amountPaid: data.amountPaid || 0,
    notes: data.notes || null,
    rawWhatsappSnippet: data.rawWhatsappSnippet || null,
    aiSummary: data.aiSummary || null,
    aiConfidence: data.aiConfidence ?? null,
  };

  let id = data.id;
  if (id) {
    const previous = await db.lead.findUnique({ where: { id }, select: { status: true, visitDate: true } });
    await db.$transaction(async (tx) => {
      await tx.lead.update({ where: { id }, data: payload });
      if (previous?.status !== data.status) {
        await tx.interaction.create({ data: { leadId: id!, type: "status", content: `Status changed from ${previous?.status || "unknown"} to ${data.status}` } });
      }
      if (data.visitDate && previous?.visitDate?.getTime() !== data.visitDate.getTime()) {
        await tx.visit.create({ data: { leadId: id!, visitDate: data.visitDate, status: "Scheduled", notes: "Scheduled from lead form" } });
      }
    });
  } else {
    const created = await db.lead.create({ data: payload });
    id = created.id;
    await db.interaction.create({ data: { leadId: id, type: "lead", content: "Lead created" } });
    if (data.visitDate) await db.visit.create({ data: { leadId: id, visitDate: data.visitDate, status: "Scheduled", notes: "Scheduled from lead form" } });
  }

  refreshCrm();
  redirect(`/leads/${id}`);
}

export async function saveLeadForm(formData: FormData) {
  await saveLead(Object.fromEntries(formData));
}

export async function updateLeadStatus(leadId: string, status: string) {
  const validStatus = z.string().min(1).parse(status);
  const db = getDb();
  const lead = await db.lead.update({ where: { id: leadId }, data: { status: validStatus } });
  await db.interaction.create({ data: { leadId, type: "status", content: `Status updated to ${validStatus}` } });
  refreshCrm();
  revalidatePath(`/leads/${lead.id}`);
}

export async function deleteLead(leadId: string) {
  const id = z.string().min(1).parse(leadId);
  const db = getDb();
  const existing = await db.lead.findUnique({ where: { id }, select: { id: true, name: true, phone: true } });
  if (!existing) throw new Error("Lead not found");
  await db.lead.delete({ where: { id } });
  refreshCrm();
}

export async function completeFollowUp(leadId: string) {
  const db = getDb();
  await db.$transaction([
    db.lead.update({ where: { id: leadId }, data: { followUpDate: null } }),
    db.interaction.create({ data: { leadId, type: "follow-up", content: "Follow-up completed" } }),
  ]);
  refreshCrm();
}

export async function addInteraction(leadId: string, content: string, type = "note") {
  const clean = z.string().trim().min(1).max(5000).parse(content);
  const db = getDb();
  await db.interaction.create({ data: { leadId, type, content: clean } });
  revalidatePath(`/leads/${leadId}`);
}

export async function createPayment(input: unknown): Promise<{ error?: string }> {
  const data = paymentSchema.parse(input);
  const db = getDb();
  const pkg = data.packageId ? await db.package.findUnique({ where: { id: data.packageId } }) : null;
  const name = pkg?.name.toLowerCase() || "";
  // Named packages first; any other renewing package (the virtual address
  // plans, monthly or prepaid) still makes the payer a member.
  const nextStatus = name.includes("day pass") ? "Paid Day Pass" : name.includes("monthly") ? "Paid Monthly" : name.includes("team") ? "Active Member" : pkg && isRecurringBillingType(pkg.billingType) ? "Paid Monthly" : undefined;

  try {
    await db.$transaction(async (tx) => {
      const subscriptionId = await resolvePaymentSubscription(tx, {
        leadId: data.leadId,
        packageId: data.packageId || null,
        requested: data.subscriptionId || null,
        newLabel: data.subscriptionLabel,
        whenAmbiguous: "error",
      });
      const subscription = subscriptionId ? await tx.subscription.findUnique({ where: { id: subscriptionId }, include: { package: true } }) : null;
      await tx.payment.create({ data: { leadId: data.leadId, packageId: data.packageId || null, subscriptionId, amount: data.amount, paymentMethod: data.paymentMethod, paymentDate: data.paymentDate, notes: data.notes || null } });
      const aggregate = await tx.payment.aggregate({ where: { leadId: data.leadId }, _sum: { amount: true } });
      await tx.lead.update({ where: { id: data.leadId }, data: { amountPaid: aggregate._sum.amount || data.amount, paymentStatus: "Paid", ...(nextStatus ? { status: nextStatus } : {}) } });
      await tx.interaction.create({ data: { leadId: data.leadId, type: "payment", content: `Payment recorded: ${data.amount.toLocaleString()} RWF via ${data.paymentMethod}${subscription ? ` for ${subscriptionName(subscription)}` : ""}` } });
    });
  } catch (error) {
    if (error instanceof AmbiguousSubscriptionError) return { error: error.message };
    throw error;
  }
  refreshCrm();
  revalidatePath(`/leads/${data.leadId}`);
  return {};
}

export async function createPaymentForm(formData: FormData) {
  await createPayment(Object.fromEntries(formData));
}

export async function createVisit(input: unknown) {
  const data = visitSchema.parse(input);
  const db = getDb();
  await db.$transaction([
    db.visit.create({ data: { leadId: data.leadId, visitDate: data.visitDate, status: data.status, notes: data.notes || null } }),
    db.lead.update({ where: { id: data.leadId }, data: { visitDate: data.visitDate, status: data.status === "Scheduled" ? "Visit Scheduled" : undefined } }),
    db.interaction.create({ data: { leadId: data.leadId, type: "visit", content: `Visit ${data.status.toLowerCase()} for ${data.visitDate.toLocaleString()}` } }),
  ]);
  refreshCrm();
}

export async function createVisitForm(formData: FormData) {
  await createVisit(Object.fromEntries(formData));
}

export async function updateVisitStatus(visitId: string, status: string) {
  const validStatus = z.enum(VISIT_STATUSES).parse(status);
  const db = getDb();
  const visit = await db.visit.update({ where: { id: visitId }, data: { status: validStatus } });
  await db.interaction.create({ data: { leadId: visit.leadId, type: "visit", content: `Visit marked ${validStatus}` } });
  refreshCrm();
}

export async function updatePackage(formData: FormData) {
  const id = z.string().parse(formData.get("id"));
  const name = z.string().trim().min(2).parse(formData.get("name"));
  const price = z.coerce.number().int().positive().parse(formData.get("price"));
  const billingType = z.string().trim().min(2).parse(formData.get("billingType"));
  const description = z.string().trim().optional().parse(formData.get("description"));
  await getDb().package.update({ where: { id }, data: { name, price, billingType, description: description || null } });
  refreshCrm();
}

/**
 * Issues a portal invite for a lead and hands back a WhatsApp link with the
 * message ready to send. Staff click through to their own WhatsApp and press
 * send, which is how every other message to a member already goes out.
 */
export async function issuePortalInvite(leadId: string) {
  const { createPortalInvite } = await import("@/lib/portal-invite");
  const invite = await createPortalInvite(leadId);
  await getDb().interaction.create({
    data: {
      leadId,
      type: "note",
      content: "Portal invite link generated and sent on WhatsApp.",
    },
  });
  revalidatePath(`/leads/${leadId}`);
  return { whatsappUrl: invite.whatsappUrl, signupUrl: invite.signupUrl };
}

function optionalText(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Opens or edits one of a person's subscriptions (label, plan, start date). */
export async function saveSubscription(formData: FormData) {
  const data = subscriptionSchema.parse({
    id: optionalText(formData, "id"),
    leadId: formData.get("leadId"),
    label: optionalText(formData, "label"),
    packageId: optionalText(formData, "packageId"),
    startDate: optionalText(formData, "startDate"),
    notes: optionalText(formData, "notes"),
  });
  const db = getDb();
  const payload = { label: data.label || null, packageId: data.packageId || null, notes: data.notes || null, ...(data.startDate ? { startDate: data.startDate } : {}) };

  if (data.id) {
    const updated = await db.subscription.updateMany({ where: { id: data.id, leadId: data.leadId }, data: payload });
    if (updated.count === 0) throw new Error("Subscription not found");
  } else {
    const created = await db.subscription.create({ data: { leadId: data.leadId, ...payload }, include: { package: true } });
    await db.interaction.create({ data: { leadId: data.leadId, type: "note", content: `Subscription added: ${subscriptionName(created)}` } });
  }
  refreshCrm();
  revalidatePath(`/leads/${data.leadId}`);
}

/** Cancels a subscription, or brings a cancelled one back. History is kept either way. */
export async function setSubscriptionStatus(formData: FormData) {
  const id = z.string().min(1).parse(formData.get("id"));
  const status = z.enum(["active", "cancelled"]).parse(formData.get("status"));
  const db = getDb();
  const sub = await db.subscription.update({
    where: { id },
    data: { status, cancelledAt: status === "cancelled" ? new Date() : null },
    include: { package: true },
  });
  await db.interaction.create({ data: { leadId: sub.leadId, type: "note", content: `Subscription ${status === "cancelled" ? "cancelled" : "reactivated"}: ${subscriptionName(sub)}` } });
  refreshCrm();
  revalidatePath(`/leads/${sub.leadId}`);
}

/**
 * Moves a payment onto another of the same person's subscriptions, or off all
 * of them. This is how staff split one contact's history across the
 * businesses it actually paid for.
 */
export async function movePaymentToSubscription(paymentId: string, subscriptionId: string | null) {
  const id = z.string().min(1).parse(paymentId);
  const db = getDb();
  const payment = await db.payment.findUnique({ where: { id }, select: { leadId: true } });
  if (!payment) throw new Error("Payment not found");
  if (subscriptionId) {
    const sub = await db.subscription.findFirst({ where: { id: subscriptionId, leadId: payment.leadId }, select: { id: true } });
    if (!sub) throw new Error("Subscription not found");
  }
  await db.payment.update({ where: { id }, data: { subscriptionId } });
  refreshCrm();
  revalidatePath(`/leads/${payment.leadId}`);
}
