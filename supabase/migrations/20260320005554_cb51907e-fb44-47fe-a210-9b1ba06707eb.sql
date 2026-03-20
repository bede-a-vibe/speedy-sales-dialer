
-- Reassign pipeline_items from duplicates to keepers
WITH ranked AS (
  SELECT id, business_name, phone,
    ROW_NUMBER() OVER (
      PARTITION BY business_name, phone
      ORDER BY CASE WHEN status != 'uncalled' THEN 0 ELSE 1 END, created_at ASC
    ) AS rn
  FROM contacts
),
keepers AS (
  SELECT business_name, phone, id AS keeper_id FROM ranked WHERE rn = 1
),
dups AS (
  SELECT r.id AS dup_id, k.keeper_id
  FROM ranked r JOIN keepers k ON r.business_name = k.business_name AND r.phone = k.phone
  WHERE r.rn > 1
)
UPDATE pipeline_items pi
SET contact_id = d.keeper_id
FROM dups d
WHERE pi.contact_id = d.dup_id;
