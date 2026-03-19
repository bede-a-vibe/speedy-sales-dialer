

# Mark Non-Mobile Australian Numbers as Do Not Call

## What Changes

A single SQL UPDATE marks all contacts whose phone number is **not** an Australian mobile (starting with `04` or `+614`) as `is_dnc = true`. This removes them from the dialer queue immediately — no code changes needed since the dialer already filters out `is_dnc = true` contacts.

## Scope

- **~14,400 contacts** will be set to `is_dnc = true`
- **~37,400 mobile contacts** remain untouched
- Contacts already marked DNC stay unchanged

## Implementation

Run a single data update (via the insert/update tool, not a migration):

```sql
UPDATE contacts
SET is_dnc = true, updated_at = now()
WHERE is_dnc = false
  AND NOT (REGEXP_REPLACE(phone, '[^0-9]', '', 'g') ~ '^(04|614)');
```

This matches landlines (02, 03, 07, 08), 1300/1800 numbers, international numbers, and any other non-mobile format.

## No Code Changes Required

The dialer, contacts page, and all queries already filter on `is_dnc = false`. These contacts will simply disappear from the active queue.

## Reversibility

If needed, these contacts can be un-DNC'd later by filtering on `is_dnc = true` and checking phone patterns — no data is deleted.

