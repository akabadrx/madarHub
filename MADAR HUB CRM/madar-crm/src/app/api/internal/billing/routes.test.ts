import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { POST as acceptPost } from "@/app/api/internal/billing/accept/route";
import { POST as checkoutPost } from "@/app/api/internal/checkout/route";

process.env.INTERNAL_API_SECRET = "test-secret";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost/crm";
process.env.CRM_AUTH_SECRET = "auth-secret";

const VA = { id: "pkg-va", slug: "virtual-business-address", name: "Virtual Address", price: 100_000, billingType: "monthly", active: true };
const d = (iso: string) => new Date(`${iso}T09:00:00Z`);

/** Just enough of the Prisma client for these routes, swapped in through getDb()'s global. */
function fakeDb(sub: Record<string, unknown>) {
  const created: Record<string, unknown>[] = [];
  const db = {
    created,
    package: { findUnique: async () => VA },
    lead: { findUnique: async () => ({ id: "lead-1" }) },
    subscription: {
      findFirst: async () => sub,
      findUnique: async () => sub,
      findMany: async () => [sub],
      aggregate: async () => ({ _sum: { penaltyAmount: null } }),
    },
    pesapalPayment: { create: async ({ data }: { data: Record<string, unknown> }) => created.push(data) },
    $transaction: async (fn: (tx: unknown) => unknown) => fn(db),
  };
  (globalThis as unknown as { prisma: unknown }).prisma = db;
  return db;
}

const json = (body: unknown) => ({
  method: "POST",
  headers: { authorization: "Bearer test-secret", "content-type": "application/json" },
  body: JSON.stringify(body),
});

test("a request without a CRM session gets 403 on server actions", async () => {
  const res = await proxy(new NextRequest("http://localhost/leads/lead-1", { method: "POST", headers: { "next-action": "abc" } }));
  assert.equal(res.status, 403);
});

test("the Loyalty offer is refused to a member who is not eligible", async () => {
  // One payment only: not eligible, whatever the request says.
  fakeDb({
    id: "sub-1",
    leadId: "lead-1",
    status: "active",
    packageId: VA.id,
    priceOverride: null,
    payments: [{ paymentDate: new Date(), amount: 118_000, packageId: VA.id }],
  });
  const res = await acceptPost(new Request("http://x", json({ leadId: "lead-1", subscriptionId: "sub-1", portalUserId: "u1", termsVersion: "anything" })));
  assert.equal(res.status, 403);
});

test("checkout charges what the server's records say, not what the request says", async () => {
  const now = new Date();
  const lastMonth = new Date(now.getTime() - 25 * 86_400_000);
  const sub = {
    id: "sub-1",
    leadId: "lead-1",
    status: "active",
    packageId: VA.id,
    package: VA,
    termsAcceptances: [{ termsVersion: "v1" }],
    payments: [{ paymentDate: lastMonth, amount: 118_000, packageId: VA.id }],
    priceOverride: { kind: "loyalty", amount: 85_000, vatInclusive: true, effectiveFrom: d("2026-01-01"), commitmentMonths: 12, terms: "t", termsVersion: "v1", note: null, createdAt: d("2026-01-01") },
  };
  const db = fakeDb(sub);
  // Pesapal itself is not reachable in a test; the order row is written first.
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("offline"); };
  try {
    await checkoutPost(new Request("http://x", json({
      packageSlug: VA.slug, customerName: "Test Member", customerEmail: "m@example.com", customerPhone: "250788000000",
      leadId: "lead-1", subscriptionId: "sub-1", amount: 1, chargedAmount: 1,
    })));
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(db.created.length, 1);
  assert.equal(db.created[0].amount, 85_000);
  assert.equal(db.created[0].chargedAmount, 87_550);

  // The same member before accepting the terms is refused.
  fakeDb({ ...sub, termsAcceptances: [] });
  const refused = await checkoutPost(new Request("http://x", json({
    packageSlug: VA.slug, customerName: "Test Member", customerEmail: "m@example.com", customerPhone: "250788000000", leadId: "lead-1", subscriptionId: "sub-1",
  })));
  assert.equal(refused.status, 403);
});
