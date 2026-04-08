

## Plan: Unify Phone Normalization to E.164 Canonical Lookup

### Problem

There are three separate phone normalization functions across the edge functions, and they disagree:

- `ghl-webhook/index.ts` → `normalizePhoneE164()` → returns `+61412345678` (E.164) ✓
- `dialpad/index.ts` → `normalizePhoneNumberToE164()` → returns `+61412345678` (E.164) ✓
- `ghl/index.ts` → `normalisePhone()` → returns `0412345678` (local format) ✗

The `ghl/index.ts` bulk import function matches against the raw `phone` column using string equality (`phone.eq.0412345678`), which fails when the stored phone is in a different format (e.g., `+61 412 345 678` or `0412 345 678`). It also never queries `phone_e164`, making the canonical column useless for imports.

The DNC guard in the same function has the same problem — it matches on raw `phone`, so a DNC contact stored as `+61412345678` won't match an import with `0412345678`.

### Changes

#### 1. Replace `normalisePhone()` in `ghl/index.ts` with E.164 normalization
**File:** `supabase/functions/ghl/index.ts`

Replace the `normalisePhone()` function (lines 440-448) with the same E.164 logic used in `ghl-webhook`. This gives one canonical format across all three edge functions.

#### 2. Switch phone matching to use `phone_e164` column
**File:** `supabase/functions/ghl/index.ts`

In `bulkImportFromGhl` (lines 522-534 and 563-576):
- Phone match: query `phone_e164.eq.<normalized>` instead of the raw `phone` column `or()` pattern
- DNC guard: query `phone_e164.eq.<normalized>` + `is_dnc.eq.true` instead of raw phone matching

This ensures all lookups go through the canonical column populated by the database trigger.

#### 3. Redeploy `ghl` edge function
Deploy the updated function so imports use canonical matching immediately.

### What this fixes

| Before | After |
|--------|-------|
| Import phone match uses local format against raw `phone` | Uses E.164 against indexed `phone_e164` |
| DNC guard matches raw strings (fragile) | Matches canonical E.164 (deterministic) |
| Three different normalization outputs | All three functions produce E.164 |

### What stays the same
- The `phone` column continues to store whatever format was originally provided (no migration needed)
- The `phone_e164` column and trigger continue to provide the canonical index
- `ghl-webhook` and `dialpad` functions are already correct

