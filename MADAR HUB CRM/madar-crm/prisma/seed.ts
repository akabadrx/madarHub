import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_TEMPLATES } from "../src/lib/constants";
import { SERVICE_CATALOG } from "../src/lib/service-catalog";

const prisma = new PrismaClient();

const day = 24 * 60 * 60 * 1000;
const sampleLeads = [
  { name: "Jean Claude", phone: "250788111111", source: "Meta Ads", interest: "Day Pass", status: "New Lead", notes: "Interested in trying the coworking space first." },
  { name: "Alice Uwase", phone: "250788222222", source: "Instagram", interest: "Monthly Fixed Desk", status: "Hot Lead", followUpDate: new Date(), notes: "Looking for a fixed desk for her startup." },
  { name: "Peter Mugisha", phone: "250788333333", source: "Referral", interest: "Private Team Room", status: "Visit Scheduled", visitDate: new Date(Date.now() + day), followUpDate: new Date(Date.now() + 2 * day), notes: "Team of five; wants to visit tomorrow afternoon." },
  { name: "Marie Claire", phone: "250788444444", source: "WhatsApp Direct", interest: "Student Study Space", status: "Student Lead", followUpDate: new Date(Date.now() - day), notes: "University student who asked about student pricing." },
  { name: "David Nshuti", phone: "250788555555", source: "Meta Ads", interest: "Day Pass", status: "Paid Day Pass", paymentStatus: "Paid", amountPaid: 8260, notes: "Paid for a day pass including VAT via MoMo Pay." },
];

async function main() {
  await prisma.interaction.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.messageTemplate.deleteMany();
  await prisma.package.deleteMany();

  for (const pkg of SERVICE_CATALOG) await prisma.package.create({ data: pkg });
  for (const template of DEFAULT_TEMPLATES) await prisma.messageTemplate.create({ data: { ...template } });

  const createdPackages = await prisma.package.findMany();
  const packageMap = new Map(createdPackages.map((pkg) => [pkg.name, pkg.id]));
  const packageForInterest: Record<string, string> = {
    "Day Pass": "Coworking Day Pass", "Monthly Fixed Desk": "Fixed Desk Monthly Subscription",
    "Private Team Room": "Private Team Room — Standard", "Student Study Space": "Student Meeting Room Day Pass",
  };

  for (const lead of sampleLeads) {
    const packageName = packageForInterest[lead.interest];
    const suggestedPackageId = packageMap.get(packageName);
    const created = await prisma.lead.create({ data: { ...lead, suggestedPackageId, paymentStatus: lead.paymentStatus || "Pending", amountPaid: lead.amountPaid || 0 } });
    await prisma.interaction.create({ data: { leadId: created.id, type: "note", content: lead.notes } });

    if (lead.status === "Paid Day Pass") {
      await prisma.payment.create({ data: { leadId: created.id, packageId: suggestedPackageId, amount: 8260, paymentMethod: "MoMo Pay", notes: "Seed payment including VAT" } });
      await prisma.interaction.create({ data: { leadId: created.id, type: "payment", content: "Paid 8,260 RWF including VAT for Coworking Day Pass via MoMo Pay" } });
    }
    if (lead.visitDate) await prisma.visit.create({ data: { leadId: created.id, visitDate: lead.visitDate, status: "Scheduled", notes: "Introductory tour" } });
  }
  console.log("Madar Hub CRM seed completed.");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => prisma.$disconnect());
