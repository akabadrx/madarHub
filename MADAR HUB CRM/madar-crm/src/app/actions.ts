"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { leadSchema, paymentSchema, visitSchema } from "@/lib/validation";
import { VISIT_STATUSES } from "@/lib/constants";

function refreshCrm() {
  ["/", "/leads", "/follow-ups", "/visits", "/payments", "/packages", "/lead-assistant"].forEach((path) => revalidatePath(path));
}

export async function saveLead(input: unknown) {
  const data = leadSchema.parse(input);
  const db = getDb();
  const payload = {
    name: data.name || null,
    phone: data.phone,
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

export async function createPayment(input: unknown) {
  const data = paymentSchema.parse(input);
  const db = getDb();
  const pkg = data.packageId ? await db.package.findUnique({ where: { id: data.packageId } }) : null;
  const name = pkg?.name.toLowerCase() || "";
  const nextStatus = name.includes("day pass") ? "Paid Day Pass" : name.includes("monthly") ? "Paid Monthly" : name.includes("team") ? "Active Member" : undefined;

  await db.$transaction(async (tx) => {
    await tx.payment.create({ data: { leadId: data.leadId, packageId: data.packageId || null, amount: data.amount, paymentMethod: data.paymentMethod, paymentDate: data.paymentDate, notes: data.notes || null } });
    const aggregate = await tx.payment.aggregate({ where: { leadId: data.leadId }, _sum: { amount: true } });
    await tx.lead.update({ where: { id: data.leadId }, data: { amountPaid: aggregate._sum.amount || data.amount, paymentStatus: "Paid", ...(nextStatus ? { status: nextStatus } : {}) } });
    await tx.interaction.create({ data: { leadId: data.leadId, type: "payment", content: `Payment recorded: ${data.amount.toLocaleString()} RWF via ${data.paymentMethod}` } });
  });
  refreshCrm();
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
