import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_TEMPLATES } from "../src/lib/constants";

const prisma = new PrismaClient();

const packages = [
  { name: "Coworking Day Pass", slug: "coworking-day-pass", price: 10000, billingType: "daily", description: "Full-day access to the coworking space with high-speed internet, a quiet professional environment, complimentary coffee on request, and access to open community events. Best for freelancers, remote workers, digital nomads, entrepreneurs, students, and business travelers." },
  { name: "Fixed Desk Monthly Subscription", slug: "fixed-desk-monthly", price: 100000, billingType: "monthly", description: "Unlimited monthly access with your own dedicated desk, high-speed internet, complimentary coffee on request, member-only workshops and networking events, and full Madar Hub community access. Best for freelancers, remote employees, consultants, content creators, students, and entrepreneurs." },
  { name: "Private Team Room Subscription", slug: "private-team-room", price: 600000, billingType: "monthly", description: "A private team room for up to 6 registered members with high-speed internet, a professional meeting environment, complimentary coffee, and access to member-only events. Best for startups, NGOs, agencies, small businesses, project teams, and remote company teams." },
  { name: "Student Study Pass", slug: "student-study-pass", price: 3000, billingType: "daily", description: "Affordable access to a designated study area or meeting room with high-speed internet and a quiet study environment. Suitable for assignments, research, online learning, and exam preparation. Best for university and secondary school students and certification candidates." },
  { name: "Virtual Business Address", slug: "virtual-business-address", price: 100000, billingType: "monthly", description: "Professional business address at KG 42 St, Ramiro, Kibagabaga, Kimironko, Gasabo, Kigali for company registration and compliance. Includes mail handling and notification, and Address Confirmation Letter on request for active subscribers. No tenancy or lease rights created. Ideal for new companies, international founders, online businesses, consultants, and freelancers. Fixed Desk + Virtual Address bundle available for 120,000 RWF/month." },
  { name: "Fixed Desk + Virtual Address", slug: "fixed-desk-virtual-address", price: 120000, billingType: "monthly", description: "Bundle combining a Fixed Desk Monthly Subscription with a Virtual Business Address. Includes unlimited monthly access with a dedicated desk, high-speed internet, member-only workshops, community access, plus the professional business address at KG 42 St, Ramiro, Kibagabaga, Kimironko, Gasabo, Kigali for company registration and compliance." },
  { name: "Meeting Room Rental (4 hours)", slug: "meeting-room-half-day", price: 20000, billingType: "hourly", description: "Professional meeting space for interviews, client meetings, training sessions, workshops, presentations, and team discussions. 4-hour booking with internet connection, professional environment, and flexible setup." },
  { name: "Meeting Room Rental (8 hours)", slug: "meeting-room-full-day", price: 30000, billingType: "hourly", description: "Professional meeting space for interviews, client meetings, training sessions, workshops, presentations, and team discussions. Full-day 8-hour booking with internet connection, professional environment, and flexible setup." },
  { name: "Workshops & Training Room Rental", slug: "training-room-daily", price: 40000, billingType: "daily", description: "Training-friendly room setup for workshops, training programs, small classes, presentations, and learning sessions. Includes whiteboard, Smart TV, and 10 cups of coffee." },
];

const day = 24 * 60 * 60 * 1000;
const sampleLeads = [
  { name: "Jean Claude", phone: "250788111111", source: "Meta Ads", interest: "Day Pass", status: "New Lead", notes: "Interested in trying the coworking space first." },
  { name: "Alice Uwase", phone: "250788222222", source: "Instagram", interest: "Monthly Fixed Desk", status: "Hot Lead", followUpDate: new Date(), notes: "Looking for a fixed desk for her startup." },
  { name: "Peter Mugisha", phone: "250788333333", source: "Referral", interest: "Private Team Room", status: "Visit Scheduled", visitDate: new Date(Date.now() + day), followUpDate: new Date(Date.now() + 2 * day), notes: "Team of five; wants to visit tomorrow afternoon." },
  { name: "Marie Claire", phone: "250788444444", source: "WhatsApp Direct", interest: "Student Study Space", status: "Student Lead", followUpDate: new Date(Date.now() - day), notes: "University student who asked about student pricing." },
  { name: "David Nshuti", phone: "250788555555", source: "Meta Ads", interest: "Day Pass", status: "Paid Day Pass", paymentStatus: "Paid", amountPaid: 10000, notes: "Paid for a day pass via MoMo Pay." },
];

async function main() {
  await prisma.interaction.deleteMany();
  await prisma.visit.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.messageTemplate.deleteMany();
  await prisma.package.deleteMany();

  for (const pkg of packages) await prisma.package.create({ data: pkg });
  for (const template of DEFAULT_TEMPLATES) await prisma.messageTemplate.create({ data: { ...template } });

  const createdPackages = await prisma.package.findMany();
  const packageMap = new Map(createdPackages.map((pkg) => [pkg.name, pkg.id]));
  const packageForInterest: Record<string, string> = {
    "Day Pass": "Coworking Day Pass", "Monthly Fixed Desk": "Fixed Desk Monthly Subscription",
    "Private Team Room": "Private Team Room Subscription", "Student Study Space": "Student Study Pass",
  };

  for (const lead of sampleLeads) {
    const packageName = packageForInterest[lead.interest];
    const suggestedPackageId = packageMap.get(packageName);
    const created = await prisma.lead.create({ data: { ...lead, suggestedPackageId, paymentStatus: lead.paymentStatus || "Pending", amountPaid: lead.amountPaid || 0 } });
    await prisma.interaction.create({ data: { leadId: created.id, type: "note", content: lead.notes } });

    if (lead.status === "Paid Day Pass") {
      await prisma.payment.create({ data: { leadId: created.id, packageId: suggestedPackageId, amount: 10000, paymentMethod: "MoMo Pay", notes: "Seed payment" } });
      await prisma.interaction.create({ data: { leadId: created.id, type: "payment", content: "Paid 10,000 RWF for Coworking Day Pass via MoMo Pay" } });
    }
    if (lead.visitDate) await prisma.visit.create({ data: { leadId: created.id, visitDate: lead.visitDate, status: "Scheduled", notes: "Introductory tour" } });
  }
  console.log("Madar Hub CRM seed completed.");
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => prisma.$disconnect());
