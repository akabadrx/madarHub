ALTER TABLE "Lead"
ADD COLUMN "leadType" TEXT,
ADD COLUMN "language" TEXT,
ADD COLUMN "importantNotes" TEXT,
ADD COLUMN "budgetMentioned" TEXT,
ADD COLUMN "numberOfPeople" INTEGER,
ADD COLUMN "requestedDate" TEXT,
ADD COLUMN "requestedTime" TEXT,
ADD COLUMN "equipmentRequest" TEXT,
ADD COLUMN "nextAction" TEXT,
ADD COLUMN "lastCustomerMessage" TEXT,
ADD COLUMN "visitIntent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentIntent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "locationRequest" BOOLEAN NOT NULL DEFAULT false;

-- Keep the CRM package table aligned with the public Madar Hub pricing page.
INSERT INTO "Package" ("id", "name", "slug", "price", "billingType", "description", "active", "createdAt", "updatedAt")
VALUES
  ('pkg_catalog_coworking_day_pass', 'Coworking Day Pass', 'coworking-day-pass', 7000, 'daily', 'One-day coworking access with internet, a comfortable workstation, a quiet professional environment, and coffee on request subject to availability. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_fixed_desk_monthly', 'Fixed Desk Monthly Subscription', 'fixed-desk-monthly', 100000, 'monthly', 'A dedicated desk for the month with coworking access, internet, selected member events and workshops, and coffee on request subject to availability. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_virtual_business_address', 'Virtual Address / Business Address Support', 'virtual-business-address', 100000, 'monthly', 'Professional address support at KG 42 Street, Kimironko for RDB/RRA registration and official correspondence, plus mail and document receiving and arrival notifications. Government, bank, tax, or legal approval is not guaranteed. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_fixed_desk_virtual_address', 'Fixed Desk + Virtual Address Package', 'fixed-desk-virtual-address', 120000, 'monthly', 'A monthly fixed desk plus business address support, mail and document receiving, internet, selected member events, and coffee on request subject to availability. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_private_team_room', 'Private Team Room — Standard', 'private-team-room', 450000, 'monthly', 'A dedicated private room for up to 6 registered members, with internet, business-address support, mail handling, and fair-use meeting-room access. Coffee is not included and costs members 1,500 RWF plus VAT per cup. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_private_team_room_coffee', 'Private Team Room — With Coffee', 'private-team-room-coffee', 600000, 'monthly', 'A dedicated private room for up to 6 registered members with internet, business-address support, mail handling, fair-use meeting-room access, and coffee on request subject to availability. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_student_study_pass', 'Student Meeting Room Day Pass', 'student-study-pass', 3000, 'daily', 'A quiet student study space with internet and normal chairs for assignments, research, online learning, and exam preparation. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_meeting_room_4_hours', 'Meeting Room Rental (Up to 4 Hours)', 'meeting-room-half-day', 20000, 'hourly', 'Private meeting-room access for up to 4 hours with internet and a Smart TV. Coffee is available for an extra fee. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_meeting_room_6_hours', 'Meeting Room Rental (Up to 6 Hours)', 'meeting-room-full-day', 30000, 'hourly', 'Private meeting-room access for up to 6 hours with internet and a Smart TV. Coffee is available for an extra fee. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pkg_catalog_training_room_daily', 'Workshops & Training Room Rental (Full Day)', 'training-room-daily', 40000, 'daily', 'A full-day room for up to 12 hours with internet, whiteboard, Smart TV, and 10 cups of coffee included. Extra coffee costs extra. Price excludes 18% VAT.', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name",
    "price" = EXCLUDED."price",
    "billingType" = EXCLUDED."billingType",
    "description" = EXCLUDED."description",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;

UPDATE "MessageTemplate"
SET "body" = E'Here are our current VAT-exclusive packages (18% VAT is added):\n\nCoworking Day Pass: 7,000 RWF/day + VAT\nFixed Desk Monthly Subscription: 100,000 RWF/month + VAT\nPrivate Team Room — Standard: 450,000 RWF/month + VAT, up to 6 members; coffee is not included and is available for 1,500 RWF + VAT per cup instead of 3,000 RWF\nPrivate Team Room — With Coffee: 600,000 RWF/month + VAT, up to 6 members; coffee included\nStudent Meeting Room Day Pass: 3,000 RWF/day + VAT\nVirtual Address / Business Address Support: 100,000 RWF/month + VAT\nFixed Desk + Virtual Address Package: 120,000 RWF/month + VAT\nMeeting Room: 20,000 RWF + VAT/up to 4 hours; 30,000 RWF + VAT/up to 6 hours\nWorkshops & Training Room: 40,000 RWF + VAT/full day up to 12 hours, including 10 cups of coffee\n\nWould you like to visit first or reserve a space?',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "title" = 'Prices message';
