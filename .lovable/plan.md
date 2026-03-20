

## Deduplicate Contacts

**Problem**: 20,881 duplicate rows (40% of 51,898 contacts) based on matching `business_name` + `phone`.

### Approach

Run a single database migration that keeps the oldest record per `(business_name, phone)` group (preserving any that have been called/actioned) and deletes the rest.

### Steps

**1. Migration: Delete duplicate contacts**

SQL logic:
- For each duplicate group, keep the row that has activity (non-`uncalled` status, or call logs) — if none have activity, keep the oldest (`min(created_at)`)
- Delete all other rows in each group
- Before deleting, verify no `call_logs`, `pipeline_items`, or `contact_notes` reference the rows being removed (orphan safety)

```sql
-- Delete duplicates, keeping the "best" row per (business_name, phone)
DELETE FROM contacts
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY business_name, phone
        ORDER BY
          CASE WHEN status != 'uncalled' THEN 0 ELSE 1 END,
          created_at ASC
      ) AS rn
    FROM contacts
  ) ranked
  WHERE rn > 1
    AND id NOT IN (SELECT DISTINCT contact_id FROM call_logs)
    AND id NOT IN (SELECT DISTINCT contact_id FROM pipeline_items)
    AND id NOT IN (SELECT DISTINCT contact_id FROM contact_notes)
);
```

**2. Migration: Add unique constraint to prevent future duplicates**

```sql
CREATE UNIQUE INDEX idx_contacts_business_phone
ON contacts (business_name, phone);
```

This prevents the same contact from being imported again.

**3. Update import logic** (minor)

Update `src/pages/UploadPage.tsx` to use `ON CONFLICT` (or catch unique-violation errors gracefully) so future uploads skip existing contacts instead of failing.

### Summary
- **1 migration**: Delete ~20,881 duplicate rows + add unique index
- **1 file edit**: `UploadPage.tsx` — handle unique constraint on import

