

## Plan: Align GHL Custom Field Mapping Across the System

### Problem

There are two disconnected paths for pushing custom fields to GHL, and they use different identifier formats:

1. **`dialpad` edge function** (AI summaries) — uses internal key names mapped to GHL field IDs via `GHL_FIELD_MAP`. This works correctly.

2. **`DecisionMakerCapture` → `ghl` edge function** — sends GHL field **keys** (e.g. `contact.decision_maker_name`) as if they were field **IDs**. The `ghl` edge function passes them straight to the GHL API, which silently ignores them because they're not valid IDs. **DM/gatekeeper data captured in the dialer is not reaching GHL.**

Additionally:
- `contact.dm_title` is sent by `DecisionMakerCapture` but doesn't exist as a GHL custom field
- Several GHL fields from your account are missing from the mapping (meeting attribution, ABN, number quality, GBP fields)
- The `gatekeeper_role` field exists in `GHL_FIELD_MAP` but `DecisionMakerCapture` never sends it

### Changes

#### 1. Add field key → ID resolution in the `ghl` edge function
**File:** `supabase/functions/ghl/index.ts`

Add the same `GHL_FIELD_MAP` (key → ID mapping) that `dialpad` uses. In the `update_contact_fields` action handler, resolve each incoming field: if the `id` matches a known field key (e.g. `contact.decision_maker_name`), replace it with the actual GHL field ID (`ag8hSUhF7BSXWc03mkT1`). If it's already a valid ID, pass it through unchanged.

This fixes the `DecisionMakerCapture` path without changing the client code.

#### 2. Add missing GHL field IDs to the mapping
**File:** `supabase/functions/ghl/index.ts` (new map) and `supabase/functions/dialpad/index.ts` (update existing map)

Add the missing fields that exist in your GHL account but aren't mapped:
- `meeting_set_by_role`, `setter_name`, `assigned_closer`, `meeting_source`, `meeting_booked_date`
- `google_business_profile`, `gbp_rating`, `review_number`
- `number_quality`, `abn`

These require the actual GHL field IDs. We'll need to either:
- Call `get_custom_fields` once to discover them, or
- You provide the IDs from GHL

#### 3. Remove the invalid `contact.dm_title` push
**File:** `src/components/dialer/DecisionMakerCapture.tsx`

Remove the line pushing `contact.dm_title` — this field doesn't exist in GHL. The DM role/title captured locally is still stored in Supabase (`dm_role`), but won't be pushed to a nonexistent GHL field.

#### 4. Fix `best_time_to_call` mapping bug in DecisionMakerCapture
**File:** `src/components/dialer/DecisionMakerCapture.tsx` line 113

`bestRoute` (the "Best Route to DM" value) is incorrectly saved to `best_time_to_call` in Supabase. Fix: save to `best_route_to_decision_maker` column instead.

#### 5. Redeploy `ghl` edge function

### What this fixes

| Before | After |
|--------|-------|
| DM/gatekeeper data silently dropped by GHL API | Field keys resolved to IDs, data reaches GHL |
| `dm_title` pushed to nonexistent field | Removed invalid push |
| `bestRoute` saved to wrong Supabase column | Saved to correct column |
| Meeting attribution fields unmapped | IDs added to mapping |

### Open question

For change #2 (missing field IDs), I need the actual GHL custom field IDs for the unmapped fields. I can either:
- **A)** Call your GHL `get_custom_fields` endpoint to discover them automatically
- **B)** You provide the IDs manually

Recommend option A — run it once and hardcode the results.

