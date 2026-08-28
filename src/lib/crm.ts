// Read-only access to the CRM's tables.
//
// The CRM owns these tables and their migrations, so they are not modelled in
// this project's schema.prisma. Reaching them through parameterised raw queries
// keeps that ownership boundary explicit: this app can read a member's own
// record, and can never migrate, alter or drop anything belonging to the CRM.
//
// Tables are qualified with public. because this app's own DATABASE_URL points
// at the separate `membership` schema, which is not on its search_path.

import { getDb } from "@/lib/db";

/** Statuses the CRM treats as an ongoing membership. */
const ACTIVE_MEMBER_STATUSES = ["Paid Monthly", "Active Member"];

export type CrmLead = {
  id: string;
  name: string | null;
  phone: string;
  status: string;
  interest: string | null;
};

export type CrmPayment = {
  id: string;
  amount: number;
  paymentMethod: string;
  paymentDate: Date;
  packageName: string | null;
};

export type CrmPackage = {
  billingType: string;
  price: number;
  name: string;
};

export type CrmCatalogPackage = {
  slug: string;
  name: string;
  price: number;
  billingType: string;
  description: string | null;
};

/**
 * Finds the CRM Lead for a normalised phone number, so a member who signs up is
 * connected to the record staff already keep for them. Returns null for someone
 * with no history — they get an account, just no membership yet.
 */
export async function findLeadByPhone(normalizedPhone: string): Promise<CrmLead | null> {
  const rows = await getDb().$queryRaw<CrmLead[]>`
    SELECT id, name, phone, status, interest
    FROM public."Lead"
    WHERE phone = ${normalizedPhone}
    ORDER BY "updatedAt" DESC
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getLead(leadId: string): Promise<CrmLead | null> {
  const rows = await getDb().$queryRaw<CrmLead[]>`
    SELECT id, name, phone, status, interest
    FROM public."Lead"
    WHERE id = ${leadId}
    LIMIT 1
  `;
  return rows[0] ?? null;
}

export function isActiveMember(status: string): boolean {
  return ACTIVE_MEMBER_STATUSES.includes(status);
}

/** The member's payments, newest first. */
export async function getPayments(leadId: string, limit = 12): Promise<CrmPayment[]> {
  return getDb().$queryRaw<CrmPayment[]>`
    SELECT p.id, p.amount, p."paymentMethod", p."paymentDate", pkg.name AS "packageName"
    FROM public."Payment" p
    LEFT JOIN public."Package" pkg ON pkg.id = p."packageId"
    WHERE p."leadId" = ${leadId}
    ORDER BY p."paymentDate" DESC
    LIMIT ${limit}
  `;
}

/**
 * The package to bill this member on: whatever their most recent payment was
 * for, falling back to the package staff suggested on the lead.
 */
export async function getCurrentPackage(leadId: string): Promise<CrmPackage | null> {
  const rows = await getDb().$queryRaw<CrmPackage[]>`
    SELECT pkg."billingType", pkg.price, pkg.name
    FROM public."Payment" p
    JOIN public."Package" pkg ON pkg.id = p."packageId"
    WHERE p."leadId" = ${leadId}
    ORDER BY p."paymentDate" DESC
    LIMIT 1
  `;
  if (rows[0]) return rows[0];

  const suggested = await getDb().$queryRaw<CrmPackage[]>`
    SELECT pkg."billingType", pkg.price, pkg.name
    FROM public."Lead" l
    JOIN public."Package" pkg ON pkg.id = l."suggestedPackageId"
    WHERE l.id = ${leadId}
    LIMIT 1
  `;
  return suggested[0] ?? null;
}

/** Active packages a member can buy, cheapest first. Slug-less rows cannot be
 * checked out (the checkout is addressed by slug), so they are excluded. */
export async function getActivePackages(): Promise<CrmCatalogPackage[]> {
  return getDb().$queryRaw<CrmCatalogPackage[]>`
    SELECT slug, name, price, "billingType", description
    FROM public."Package"
    WHERE active = true AND slug IS NOT NULL
    ORDER BY price ASC
  `;
}

/** One active package by slug, used to validate a checkout request. */
export async function getPackageBySlug(slug: string): Promise<CrmCatalogPackage | null> {
  const rows = await getDb().$queryRaw<CrmCatalogPackage[]>`
    SELECT slug, name, price, "billingType", description
    FROM public."Package"
    WHERE slug = ${slug} AND active = true
    LIMIT 1
  `;
  return rows[0] ?? null;
}
