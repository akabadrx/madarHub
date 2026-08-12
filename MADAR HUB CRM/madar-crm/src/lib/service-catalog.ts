export const SERVICE_CATALOG = [
  {
    name: "Coworking Day Pass",
    slug: "coworking-day-pass",
    price: 7000,
    billingType: "daily",
    description: "One-day coworking access with internet, a comfortable workstation, a quiet professional environment, and coffee on request subject to availability. Price excludes 18% VAT.",
  },
  {
    name: "Fixed Desk Monthly Subscription",
    slug: "fixed-desk-monthly",
    price: 100000,
    billingType: "monthly",
    description: "A dedicated desk for the month with coworking access, internet, selected member events and workshops, and coffee on request subject to availability. Price excludes 18% VAT.",
  },
  {
    name: "Virtual Address / Business Address Support",
    slug: "virtual-business-address",
    price: 100000,
    billingType: "monthly",
    description: "Professional address support at KG 42 Street, Kimironko for RDB/RRA registration and official correspondence, plus mail and document receiving and arrival notifications. Government, bank, tax, or legal approval is not guaranteed. Price excludes 18% VAT.",
  },
  {
    name: "Fixed Desk + Virtual Address Package",
    slug: "fixed-desk-virtual-address",
    price: 120000,
    billingType: "monthly",
    description: "A monthly fixed desk plus business address support, mail and document receiving, internet, selected member events, and coffee on request subject to availability. Price excludes 18% VAT.",
  },
  {
    name: "Private Team Room — Standard",
    slug: "private-team-room",
    price: 450000,
    billingType: "monthly",
    description: "A dedicated private room for up to 6 registered members, with internet, business-address support, mail handling, and fair-use meeting-room access. Coffee is not included and costs members 1,500 RWF plus VAT per cup. Price excludes 18% VAT.",
  },
  {
    name: "Private Team Room — With Coffee",
    slug: "private-team-room-coffee",
    price: 600000,
    billingType: "monthly",
    description: "A dedicated private room for up to 6 registered members with internet, business-address support, mail handling, fair-use meeting-room access, and coffee on request subject to availability. Price excludes 18% VAT.",
  },
  {
    name: "Student Meeting Room Day Pass",
    slug: "student-study-pass",
    price: 3000,
    billingType: "daily",
    description: "A quiet student study space with internet and normal chairs for assignments, research, online learning, and exam preparation. Price excludes 18% VAT.",
  },
  {
    name: "Meeting Room Rental (Up to 4 Hours)",
    slug: "meeting-room-half-day",
    price: 20000,
    billingType: "hourly",
    description: "Private meeting-room access for up to 4 hours with internet and a Smart TV. Coffee is available for an extra fee. Price excludes 18% VAT.",
  },
  {
    name: "Meeting Room Rental (Up to 6 Hours)",
    slug: "meeting-room-full-day",
    price: 30000,
    billingType: "hourly",
    description: "Private meeting-room access for up to 6 hours with internet and a Smart TV. Coffee is available for an extra fee. Price excludes 18% VAT.",
  },
  {
    name: "Workshops & Training Room Rental (Full Day)",
    slug: "training-room-daily",
    price: 40000,
    billingType: "daily",
    description: "A full-day room for up to 12 hours with internet, whiteboard, Smart TV, and 10 cups of coffee included. Extra coffee costs extra. Price excludes 18% VAT.",
  },
] as const;

export type ServiceSlug = (typeof SERVICE_CATALOG)[number]["slug"];

export function formatPackageForAi(pkg: {
  slug: string;
  name: string;
  price: number;
  billingType: string;
  description: string | null;
}) {
  return `- ${pkg.slug}: ${pkg.name} — ${pkg.price.toLocaleString("en-US")} RWF + 18% VAT (${pkg.billingType}). ${pkg.description || ""}`;
}
