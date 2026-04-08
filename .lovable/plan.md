

## Plan: Fix Core Execution Path — Identity, GHL Updates, DNC Enforcement

### Critical Bug Found

**The dialer's background persistence is completely broken.** In `DialerPage.tsx` line 443-572, the async IIFE that writes call logs, updates contact status, creates pipeline items, and syncs to GHL is **never invoked**. The code reads `(async () => { ... });` but is missing the trailing `()` to actually call it. This means:
- Call logs are not being saved
- Contact status is not being updated after outcomes
- Pipeline items for bookings are not created
- GHL sync never fires
- DNC flag is never set on the contact

This is the single most impactful fix.

### Additional Weak Points

Several other issues weaken identity resolution, GHL reliability, and DNC enforcement.

---

### Changes (in priority order)

#### 1. Fix the broken IIFE — restore all background writes
**File:** `src/pages/DialerPage.tsx` line 572

Change `});` to `})();` so the async function actually executes. This single character restores call logging, contact updates, pipeline creation, and GHL sync.

#### 2. Add `phone_e164` column to contacts table
**Migration**

The GHL webhook (`ghl-webhook/index.ts`) already writes to `phone_e164` and queries by it for identity matching, but the column doesn't exist. This causes silent failures on every webhook event.

- Add `phone_e164 TEXT` column to `contacts`
- Backfill from existing `phone` values using the AU normalisation logic
- Add a trigger to auto-populate `phone_e164` on insert/update of `phone`
- Add an index on `phone_e164` for fast lookups

This gives canonical phone matching across dialer, webhooks, and GHL sync.

#### 3. Harden DNC enforcement in the pipeline outcome trigger
**Migration — update `sync_pipeline_outcome_to_contact` function**

The trigger currently can set a DNC'd contact's status to `follow_up` or other values. Add a guard: if `is_dnc = true` on the contact, skip the status update entirely. A DNC contact should never re-enter any active pipeline state.

#### 4. Protect DNC in GHL webhook ContactUpdate path
**File:** `supabase/functions/ghl-webhook/index.ts`

When processing a `ContactUpdate`, strip `is_dnc` and `status` from the update payload so a GHL update can never accidentally un-DNC a contact that was marked DNC in the dialer. Only the explicit `ContactDndUpdate` event type should touch `is_dnc`.

Also set `status = 'dnc'` alongside `is_dnc = true` in the `ContactDndUpdate` handler for consistency.

#### 5. Protect DNC in bulk import from GHL
**File:** `supabase/functions/ghl/index.ts`

In the `bulkImportFromGhl` function, before inserting a new contact, check if a soft-deleted/DNC'd contact with the same phone already exists. If so, skip the insert rather than re-creating a DNC'd contact.

#### 6. Redeploy edge functions
Deploy updated `ghl`, `ghl-webhook`, and `dialpad` functions.

---

### What each fix addresses

| Fix | GHL Updates | DNC Enforcement | Identity |
|-----|-------------|-----------------|----------|
| 1. IIFE invocation | Restores all GHL sync | Restores DNC flag writes | — |
| 2. phone_e164 column | Better phone matching | — | Canonical identity |
| 3. Pipeline trigger guard | — | Prevents DNC reactivation | — |
| 4. Webhook DNC protection | — | Prevents webhook un-DNC | — |
| 5. Import DNC check | — | Prevents reimport of DNC | — |

### Remaining weak points after this plan

- **Client-side GHL sync has no retry queue**: If the GHL API is down when `pushCallNote`/`pushBooking` fires from the browser, it's lost. The server-side AI summary pipeline has `pending_ghl_pushes` for retry, but client-side outcome notes don't. A future improvement would route all GHL writes through the server-side queue.
- **No scheduled cron for `process_pending_ghl_pushes`**: The retry queue exists but only processes when an admin manually triggers it. A cron job would make it autonomous.
- **Phone storage is still mixed format**: Existing contacts store raw AU format (`0412345678`). The `phone_e164` column adds canonical lookup but doesn't migrate the primary `phone` column. Full migration would be a larger change.

