// Package presentation copy, lifted verbatim from the marketing site's
// pricing.html so a signed-in member sees exactly the card a visitor sees.
//
// The bullets, tagline, badge and "best for" line live in that page as
// hand-written HTML rather than in the CRM catalogue, so they are mirrored
// here. Prices, names and availability still come from the database at request
// time - only this descriptive copy is duplicated.
//
// If a package's copy changes on the pricing page, update the matching entry
// here. A package with no entry falls back to its CRM description.

export type PackageCopy = {
  kind: string;
  badge: string | null;
  capacity: string | null;
  featured: boolean;
  tagline: string;
  benefits: string[];
  moreBenefits: string[];
  bestFor: string | null;
  moreLabel: string;
};

export const PACKAGE_COPY: Record<string, PackageCopy> = {
  "coworking-day-pass": {
    "kind": "Day Pass",
    "badge": null,
    "capacity": null,
    "featured": false,
    "tagline": "A flexible one-day pass for anyone who needs a quiet, professional place to work, study, or take online meetings.",
    "benefits": [
      "Coworking space access for the day",
      "Internet access",
      "Quiet professional environment",
      "Comfortable workstation"
    ],
    "moreBenefits": [
      "Suitable for remote work, studying, freelancing, online meetings, and focused work",
      "Coffee served on request, subject to availability"
    ],
    "bestFor": "Remote workers, freelancers, students, visitors, and anyone who needs a productive workspace for one day.",
    "moreLabel": "Full package details"
  },
  "fixed-desk-monthly": {
    "kind": "Monthly Membership",
    "badge": null,
    "capacity": null,
    "featured": false,
    "tagline": "A monthly membership for people who need a consistent workspace and their own dedicated desk at Madar Hub.",
    "benefits": [
      "Your own fixed desk for the month",
      "Monthly coworking access",
      "Internet access",
      "Access to member-only events and workshops"
    ],
    "moreBenefits": [
      "Quiet professional workspace",
      "Coffee served on request, subject to availability",
      "Access to open/free Madar Hub events and workshops",
      "Suitable space for daily work, study, freelancing, online work, and business tasks"
    ],
    "bestFor": "Freelancers, remote workers, students, entrepreneurs, creators, and professionals who need a regular workspace.",
    "moreLabel": "Full package details"
  },
  "virtual-business-address": {
    "kind": "Monthly Service",
    "badge": null,
    "capacity": null,
    "featured": false,
    "tagline": "A professional business address in Kigali for registration and official correspondence — ideal for freelancers, consultants, and small companies.",
    "benefits": [
      "Use of Madar Hub's physical address for business registration support",
      "Physical address support for RDB/RRA registration and official business correspondence",
      "Mail and document receiving",
      "Professional business address in Kimironko, KG 42 Street, Kigali"
    ],
    "moreBenefits": [
      "Address authorization support",
      "Notification when mail or documents arrive",
      "Basic office administrative support related to address use"
    ],
    "bestFor": "Freelancers, consultants, small businesses, remote companies, and entrepreneurs who need a physical address for business registration and official correspondence.",
    "moreLabel": "Full package details"
  },
  "fixed-desk-virtual-address": {
    "kind": "Monthly Bundle",
    "badge": "Most Popular",
    "capacity": null,
    "featured": true,
    "tagline": "The best of both — a real working desk plus professional business address support, in one package.",
    "benefits": [
      "Your own fixed desk for the month",
      "Use of Madar Hub's physical address for business registration support",
      "Mail and document receiving",
      "Access to member-only events and workshops"
    ],
    "moreBenefits": [
      "Internet access",
      "Quiet professional workspace",
      "Coffee served on request, subject to availability",
      "Physical address support for RDB/RRA registration and official business correspondence",
      "Address authorization support",
      "Notification when mail or documents arrive",
      "Access to open/free Madar Hub events and workshops"
    ],
    "bestFor": "Freelancers, consultants, entrepreneurs, remote workers, and small business owners who need a real workspace plus a professional business address.",
    "moreLabel": "Full package details"
  },
  "private-team-room": {
    "kind": "Monthly · Teams · No Coffee Included",
    "badge": null,
    "capacity": "Up to 6 registered members",
    "featured": false,
    "tagline": "A dedicated private room with all core team benefits. Coffee is not included and can be ordered at a special member rate.",
    "benefits": [
      "Dedicated private room",
      "Business registration address support for the team/company",
      "Access to the meeting room for team meetings, subject to availability and fair-use scheduling",
      "Internet access",
      "Coffee is not included",
      "Special coffee rate: 1,500 RWF plus VAT per cup instead of 3,000 RWF"
    ],
    "moreBenefits": [
      "Capacity for up to 6 registered members",
      "Use of Madar Hub's physical address for business registration support",
      "Physical address support for RDB/RRA registration and official business correspondence",
      "Mail and document receiving",
      "Notification when mail or documents arrive",
      "Access to member-only events and workshops for registered team members",
      "Access to open/free Madar Hub events and workshops",
      "Suitable space for teamwork, client meetings, daily operations, planning, and online calls"
    ],
    "bestFor": "Small teams, startups, companies, NGOs, agencies, consultants, and organizations that need a private workspace and professional business address support.",
    "moreLabel": "Full package details"
  },
  "private-team-room-coffee": {
    "kind": "Monthly · Teams · Coffee Included",
    "badge": null,
    "capacity": "Up to 6 registered members",
    "featured": true,
    "tagline": "The full private team room package with coffee included for registered team members.",
    "benefits": [
      "Dedicated private room",
      "Business registration address support for the team/company",
      "Access to the meeting room for team meetings, subject to availability and fair-use scheduling",
      "Internet access",
      "Coffee included and served on request, subject to availability"
    ],
    "moreBenefits": [
      "Capacity for up to 6 registered members",
      "Use of Madar Hub's physical address for business registration support",
      "Physical address support for RDB/RRA registration and official business correspondence",
      "Mail and document receiving",
      "Notification when mail or documents arrive",
      "Access to member-only events and workshops for registered team members",
      "Access to open/free Madar Hub events and workshops",
      "Suitable space for teamwork, client meetings, daily operations, planning, and online calls"
    ],
    "bestFor": "Teams that regularly drink coffee and prefer it included in one monthly package.",
    "moreLabel": "Full package details"
  },
  "student-study-pass": {
    "kind": "Student Day Pass",
    "badge": null,
    "capacity": null,
    "featured": false,
    "tagline": "An affordable, quiet study space for students working on assignments, research, or exam preparation.",
    "benefits": [
      "Internet access",
      "Quiet study environment",
      "Suitable space for studying, assignments, research, online learning, and exam preparation",
      "Access to open/free Madar Hub events and workshops"
    ],
    "moreBenefits": [
      "Normal chairs"
    ],
    "bestFor": "Students who need an affordable and focused study space.",
    "moreLabel": "Full package details"
  },
  "meeting-room-half-day": {
    "kind": "4-Hour / 6-Hour Rental",
    "badge": null,
    "capacity": null,
    "featured": false,
    "tagline": "A private meeting room for meetings, interviews, client discussions, online calls, and planning sessions.",
    "benefits": [
      "Private meeting room access",
      "Smart TV available for presentations and projection",
      "Internet access",
      "Quiet professional environment"
    ],
    "moreBenefits": [
      "Normal chairs"
    ],
    "bestFor": "Meetings, interviews, planning sessions, online calls, client discussions, study groups, and small team sessions.",
    "moreLabel": "Full package details"
  },
  "training-room-daily": {
    "kind": "Full Day · Up to 12 Hours",
    "badge": null,
    "capacity": null,
    "featured": false,
    "tagline": "A training-friendly room setup for workshops, training programs, small classes, presentations, and learning sessions.",
    "benefits": [
      "Room access for the day",
      "Whiteboard and Smart TV for presentations",
      "10 cups of coffee included",
      "Internet access"
    ],
    "moreBenefits": [
      "Normal chairs",
      "Professional training environment"
    ],
    "bestFor": "Training programs, paid workshops, learning sessions, presentations, seminars, and small group programs.",
    "moreLabel": "Full package details"
  }
};


/**
 * The order packages are shown to a member. Cheapest-first is the right default
 * for a stranger comparing prices; a member is choosing between things they
 * might actually use, so the everyday options lead. Anything not listed here
 * falls to the end, keeping its catalogue order.
 */
export const PACKAGE_ORDER: string[] = [
  "coworking-day-pass",
  "fixed-desk-monthly",
  "virtual-business-address",
  "student-study-pass",
  "meeting-room-half-day",
  "fixed-desk-virtual-address",
  "meeting-room-full-day",
  "training-room-daily",
  "private-team-room",
  "private-team-room-coffee"
];
