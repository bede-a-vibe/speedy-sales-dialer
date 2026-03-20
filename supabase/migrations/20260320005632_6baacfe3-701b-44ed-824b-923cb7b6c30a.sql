
-- Remove dialer_lead_locks for duplicates, then delete duplicate contacts
WITH ranked AS (
  SELECT id, business_name, phone,
    ROW_NUMBER() OVER (
      PARTITION BY business_name, phone
      ORDER BY CASE WHEN status != 'uncalled' THEN 0 ELSE 1 END, created_at ASC
    ) AS rn
  FROM contacts
),
dups AS (
  SELECT id AS dup_id FROM ranked WHERE rn > 1
),
deleted_locks AS (
  DELETE FROM dialer_lead_locks WHERE contact_id IN (SELECT dup_id FROM dups)
),
deleted_dialpad AS (
  DELETE FROM dialpad_calls WHERE contact_id IN (SELECT dup_id FROM dups)
)
DELETE FROM contacts WHERE id IN (SELECT dup_id FROM dups);

-- Prevent future duplicates
CREATE UNIQUE INDEX idx_contacts_business_phone ON contacts (business_name, phone);
