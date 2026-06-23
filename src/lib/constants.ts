export const BASE_PATH = "/crm";

export const LEAD_STATUSES = [
  "New Lead", "Hot Lead", "Asked Price", "Visit Scheduled", "Visited - Not Paid",
  "Paid Day Pass", "Paid Monthly", "Team Lead", "Student Lead", "Active Member",
  "Follow Up Later", "Training Room Lead", "Private Office Lead", "Monthly Lead",
  "Day Pass Lead", "Lost",
] as const;

export const LEAD_TYPES = [
  "General Coworking Lead", "Day Pass Lead", "Monthly Fixed Desk Lead",
  "Student Study Lead", "Meeting Room Lead", "Training Room Lead",
  "Private Office Lead", "Team Room Lead", "Location Request",
  "Equipment Question", "Follow Up Later", "Low Intent", "Unknown",
] as const;

export const LEAD_SOURCES = [
  "Meta Ads", "WhatsApp Direct", "Referral", "Walk-in", "Website", "Instagram", "TikTok", "Other",
] as const;

export const INTERESTS = [
  "Day Pass", "Monthly Fixed Desk", "Private Team Room", "Student Study Space",
  "Virtual Business Address", "Meeting Room Rental", "Just Visiting", "Not Sure",
] as const;

export const PAYMENT_METHODS = ["MoMo Pay", "Cash", "Bank Transfer", "Other"] as const;
export const VISIT_STATUSES = ["Scheduled", "Completed", "No Show", "Rescheduled"] as const;

export const STATUS_STYLES: Record<string, string> = {
  "New Lead": "bg-blue-50 text-blue-700 ring-blue-200",
  "Hot Lead": "bg-orange-50 text-orange-700 ring-orange-200",
  "Asked Price": "bg-violet-50 text-violet-700 ring-violet-200",
  "Visit Scheduled": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Visited - Not Paid": "bg-amber-50 text-amber-800 ring-amber-200",
  "Paid Day Pass": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Paid Monthly": "bg-green-50 text-green-700 ring-green-200",
  "Team Lead": "bg-rose-50 text-rose-700 ring-rose-200",
  "Student Lead": "bg-violet-50 text-violet-700 ring-violet-200",
  "Active Member": "bg-green-50 text-green-800 ring-green-200",
  "Follow Up Later": "bg-gray-50 text-gray-700 ring-gray-200",
  "Training Room Lead": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  "Private Office Lead": "bg-rose-50 text-rose-700 ring-rose-200",
  "Monthly Lead": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Day Pass Lead": "bg-amber-50 text-amber-700 ring-amber-200",
  "Paid": "bg-green-50 text-green-700 ring-green-200",
  "Lost": "bg-rose-50 text-rose-700 ring-rose-200",
};

export const DEFAULT_TEMPLATES = [
  {
    title: "Welcome message",
    category: "sales",
    body: `Hi {{name}} Welcome to Madar Hub!\n\nMadar Hub is a clean, quiet, professional coworking and learning space in Kigali.\n\nLocation: KG 42 Street, Kigali\nWebsite: madarorbit.com\n\nAre you looking for a day pass, monthly fixed desk, student study space, or team room?`,
  },
  {
    title: "Prices message",
    category: "sales",
    body: `Here are our current packages:\n\nCoworking Day Pass: 10,000 RWF/day\nFixed Desk Monthly Subscription: 100,000 RWF/month\nPrivate Team Room: 600,000 RWF/month, up to 6 members\nStudent Study Pass: 3,000 RWF/day\nVirtual Business Address: 100,000 RWF/month\nFixed Desk + Virtual Address: 120,000 RWF/month\nMeeting Room Rental: 25,000 RWF/4 hours or 30,000 RWF/8 hours\n\nWould you like to visit first or reserve a space?`,
  },
  {
    title: "Visit message",
    category: "visit",
    body: `You're welcome to visit and see the space first.\n\nAvailable visit options:\n1. Today: [time]\n2. Tomorrow: [time]\n3. Another time that works for you\n\nWhich time is better for you?`,
  },
  {
    title: "Payment message",
    category: "payment",
    body: `To confirm your booking, you can pay through MoMo Pay:\n\nDial: *182*8*00743#\n\nThen enter the amount.\n\nAfter payment, please send us the confirmation screenshot here on WhatsApp.`,
  },
  {
    title: "Follow-up message",
    category: "follow-up",
    body: `Hi {{name}} just checking in.\n\nWould you like me to reserve a workspace for you, or would you prefer to visit Madar Hub first and see the space?`,
  },
] as const;
