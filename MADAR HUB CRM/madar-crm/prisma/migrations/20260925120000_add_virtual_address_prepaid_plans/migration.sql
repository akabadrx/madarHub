-- Virtual Address gains two prepaid plans alongside the monthly one.
-- "6-months" and "12-months" billing types renew after 6 and 12 months
-- (see src/lib/membership.ts), so a prepaid member is not chased monthly.
-- Package.price stays the VAT-exclusive base the checkout adds 18% VAT to.

UPDATE "Package"
SET "description" = 'Professional address support at KG 42 Street, Kimironko for RDB/RRA registration and official correspondence, plus mail and document receiving and arrival notifications. Includes meeting-room access to meet clients at the hub in a professional environment, subject to availability, with Wi-Fi and a Smart TV for presentations. Government, bank, tax, or legal approval is not guaranteed. Price excludes 18% VAT.',
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "slug" = 'virtual-business-address';

-- 90,000 RWF a month plus VAT, six months paid upfront.
INSERT INTO "Package" ("id", "name", "slug", "price", "billingType", "description", "active", "createdAt", "updatedAt")
VALUES (
  'pkg_virtual_address_6_months',
  'Virtual Address / Business Address Support — 6 Months',
  'virtual-business-address-6-months',
  540000,
  '6-months',
  'Six months of virtual address support paid upfront at 90,000 RWF per month plus VAT: professional address support at KG 42 Street, Kimironko for RDB/RRA registration and official correspondence, mail and document receiving with arrival notifications, and meeting-room access to meet clients at the hub, subject to availability, with Wi-Fi and a Smart TV for presentations. Government, bank, tax, or legal approval is not guaranteed. Price excludes 18% VAT.',
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

-- 85,000 RWF a month VAT inclusive, twelve months paid upfront: 1,020,000 RWF
-- all-in. Stored as its VAT-exclusive base, 1,020,000 / 1.18 = 864,406.78,
-- rounded so the checkout's +18% comes back to exactly 1,020,000.
INSERT INTO "Package" ("id", "name", "slug", "price", "billingType", "description", "active", "createdAt", "updatedAt")
VALUES (
  'pkg_virtual_address_12_months',
  'Virtual Address / Business Address Support — 12 Months',
  'virtual-business-address-12-months',
  864407,
  '12-months',
  'Twelve months of virtual address support paid upfront at 85,000 RWF per month VAT inclusive (1,020,000 RWF in total): professional address support at KG 42 Street, Kimironko for RDB/RRA registration and official correspondence, mail and document receiving with arrival notifications, and meeting-room access to meet clients at the hub, subject to availability, with Wi-Fi and a Smart TV for presentations. Government, bank, tax, or legal approval is not guaranteed. The stored price excludes 18% VAT; with VAT it is 1,020,000 RWF.',
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
