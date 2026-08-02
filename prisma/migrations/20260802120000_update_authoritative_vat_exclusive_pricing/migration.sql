-- Package.price stores the public VAT-exclusive base price.
-- The public Pesapal checkout adds 18% VAT before creating the order.
UPDATE "Package" SET "price" = 7000 WHERE "slug" = 'coworking-day-pass';
UPDATE "Package" SET "price" = 100000 WHERE "slug" = 'fixed-desk-monthly';
UPDATE "Package"
SET "name" = 'Private Team Room — Standard',
    "price" = 450000,
    "description" = 'A private team room for up to 6 registered members. Coffee is not included; registered team members can order it at 1,500 RWF plus VAT per cup instead of the regular 3,000 RWF rate. Room price excludes 18% VAT.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'private-team-room';

INSERT INTO "Package" ("id", "name", "slug", "price", "billingType", "description", "active", "createdAt", "updatedAt")
VALUES (
  'pkg_private_team_room_coffee',
  'Private Team Room — With Coffee',
  'private-team-room-coffee',
  600000,
  'monthly',
  'A private team room for up to 6 registered members with coffee included on request subject to availability. Price excludes 18% VAT.',
  true,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
)
ON CONFLICT ("slug") DO UPDATE
SET "name" = EXCLUDED."name",
    "price" = EXCLUDED."price",
    "billingType" = EXCLUDED."billingType",
    "description" = EXCLUDED."description",
    "active" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
UPDATE "Package" SET "price" = 3000 WHERE "slug" = 'student-study-pass';
UPDATE "Package" SET "price" = 100000 WHERE "slug" = 'virtual-business-address';
UPDATE "Package" SET "price" = 120000 WHERE "slug" = 'fixed-desk-virtual-address';
UPDATE "Package" SET "name" = 'Meeting Room Rental (4 hours)', "price" = 20000 WHERE "slug" = 'meeting-room-half-day';
UPDATE "Package" SET "name" = 'Meeting Room Rental (6 hours)', "price" = 30000 WHERE "slug" = 'meeting-room-full-day';
UPDATE "Package" SET "name" = 'Meeting & Workshop Room Full Day (12 hours)', "price" = 40000 WHERE "slug" = 'training-room-daily';
