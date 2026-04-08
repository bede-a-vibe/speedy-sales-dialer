

## Audit Results: Recent Updates

### Working Correctly

1. **GHL field key → ID resolution** (`ghl/index.ts` lines 179-267): Complete 55-field map with `resolveFieldId()` applied in `updateContactFields`. DecisionMakerCapture sends keys like `contact.decision_maker_name` → resolved to `ag8hSUhF7BSXWc03mkT1` server-side. Solid.

2. **Phone E.164 normalization** (`ghl/index.ts` lines 525-538): Unified `normalisePhoneE164()` matches the logic in `ghl-webhook` and `dialpad`. Bulk import uses `phone_e164` column for matching (line 616) and DNC guard (line 657). Solid.

3. **Async IIFE invocation** (`DialerPage.tsx` line 443/572): The background persistence block `(async () => { ... })()` is properly invoked. Fixed.

4. **`dm_title` removed from GHL push** (DecisionMakerCapture lines 125-132): No longer sends the nonexistent field. Still saves `dm_role` locally in Supabase. Correct.

5. **GHL sync flow** (DialerPage lines 490-571): Identity resolution, call note, booking, follow-up, email draft, DNC — all wired and fire-and-forget with `.catch(() => {})`. Correct.

---

### Issues Found

#### 1. CRITICAL: Contact status set to `"uncalled"` after being called
**File:** `src/pages/DialerPage.tsx` line 457

```typescript
status: ["dnc", "follow_up", "booked"].includes(outcomeToLog) ? outcomeToLog : "uncalled",
```

When a rep logs `no_answer`, `voicemail`, `not_interested`, or `wrong_number`, the contact status is set back to `"uncalled"`. This **puts the contact back into the dialer queue** — they'll be dialed again immediately. It should be `"called"` for all non-special outcomes.

**Fix:** Change fallback from `"uncalled"` to `"called"`.

#### 2. MINOR: `bestRoute` saved to wrong Supabase column
**File:** `src/components/dialer/DecisionMakerCapture.tsx` line 113

```typescript
if (bestRoute) updates.best_time_to_call = bestRoute;
```

The "Best Route to DM" value (e.g. "Direct Dial", "Ask for by Name") is stored in the `best_time_to_call` column. The plan called for saving it to `best_route_to_decision_maker`, but that column doesn't exist — the migration was never created. The GHL push side works fine (sends `contact.best_route_to_dm` → resolves to correct ID), but the local Supabase storage is semantically wrong.

**Fix options:**
- A) Create a migration to rename `best_time_to_call` → `best_route_to_decision_maker` and update all references
- B) Leave as-is since it's functionally working (data stored and retrieved correctly, just misnamed)

Recommend A for clarity, but it touches the claim queries and contact type definitions.

---

### Summary

| Area | Status |
|------|--------|
| GHL field key → ID resolution | Working |
| Phone E.164 normalization | Working |
| Bulk import canonical matching | Working |
| DNC guard on import | Working |
| Background persistence IIFE | Working |
| DM capture → GHL sync | Working |
| **Contact status after call** | **BROKEN — recycling called contacts** |
| **bestRoute column name** | **Cosmetic mismatch (functional)** |

### Proposed Changes

1. **Fix status fallback** in `DialerPage.tsx` line 457: change `"uncalled"` to `"called"`
2. **Optionally** create migration to rename `best_time_to_call` → `best_route_to_decision_maker` and update `DecisionMakerCapture.tsx` + claim queries

