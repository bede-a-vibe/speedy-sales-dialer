

## Plan: Reconcile Supabase ↔ GHL contacts (phone-first match)

Since your Supabase contacts came from a GHL export, they almost certainly already exist in GHL — they just don't have the `ghl_contact_id` saved on the Supabase row. We'll build an admin "GHL Sync" page that walks the unlinked contacts, finds their existing GHL match by phone, and saves the ID. Only contacts with no GHL match get created (rare, since they all came from GHL).

### Status today

| Lifecycle | Total | Linked | Unlinked |
|---|---|---|---|
| uncalled | 30,356 | 2,984 | **27,372** |
| dnc | 423 | 322 | 101 |
| follow_up | 143 | 132 | 11 |
| called | 50 | 50 | 0 |
| booked | 45 | 41 | 4 |
| **Total** | **31,017** | **3,529** | **27,488** |

The expected outcome: ~99% of the 27,488 unlinked rows will resolve to an existing GHL contact by phone match, with maybe a few hundred genuine creates (contacts whose phone format differs in GHL or were deleted from GHL).

### What you'll see

A new admin-only page at **`/admin/ghl-sync`** (link added to the sidebar Admin section).

```
┌─ GHL Sync ─────────────────────────────────────┐
│                                                 │
│ Linked: 3,529 / 31,017  (11.4%)                │
│ Unlinked: 27,488                                │
│                                                 │
│ [ Sync Active Only (116) ]  ← recommended first │
│ [ Sync All Unlinked (27,488) ]                  │
│                                                 │
│ Batch size:  [50 ▾]   Pause between: [6s ▾]   │
│                                                 │
│ ─── Run progress ───                            │
│ ▓▓▓▓▓░░░░░░░░░░░░░░  142 / 27,488             │
│ ✓ Linked to existing GHL: 138                  │
│ + Created new in GHL: 2                         │
│ ⤵ Skipped (no phone): 2                        │
│ ⚠ Errors: 0                                     │
│ Last batch: 4.8s · ETA ~52 min                 │
│                                                 │
│ [ Pause ]  [ Download error report ]           │
└─────────────────────────────────────────────────┘
```

**Run modes:**
- **Sync Active Only** — links the 116 unlinked contacts in `dnc/follow_up/booked` first (highest value, fastest)
- **Sync All Unlinked** — full reconciliation of all 27,488 rows
- **Resumable** — closing the page or hitting Pause stops cleanly between batches; re-running picks up where you left off (idempotent — already-linked rows are skipped automatically)

**Per-contact behavior** (uses the existing `upsert_contact` action):
1. Search GHL by E.164 phone
2. If found → save `ghl_contact_id` to Supabase row, count as **Linked**
3. If not found → create in GHL with company/name/email/website/city/state, count as **Created**
4. If no phone → skip and log

### Technical changes

**1. New page `src/pages/GhlSyncPage.tsx`**
- Reads counts via the existing `contacts` queries (filter `ghl_contact_id IS NULL`)
- Drives a client-side loop that calls the existing `bulk_link_contacts` edge action with `{ batchSize, delayMs }`
- The `bulk_link_contacts` action already iterates Supabase rows in batches and returns `{ total, linked, failed, skipped, errors }` — we'll call it repeatedly with a small batch (50) so the UI can show live progress and remain cancellable
- Active-only mode passes a new optional `statusFilter: 'active'` param so the edge function only pulls non-uncalled rows

**2. Minor edit to `supabase/functions/ghl/index.ts`**
- Extend `bulk_link_contacts` to accept an optional `statusFilter` param (`'active'` = `status IN ('dnc','follow_up','booked','called')`, otherwise all unlinked)
- Return `nextOffset` / `hasMore` so the client loop knows when to stop, instead of running the entire 27k in one invocation (which would time out)
- Keeps existing company-name fallback to avoid duplicate creates

**3. Edited `src/lib/ghl.ts`**
- Add `statusFilter` to the `ghlBulkLinkContacts` signature
- Type the response to include `nextOffset`, `hasMore`

**4. Edited `src/components/AppSidebar.tsx`**
- Add **GHL Sync** nav item under the Admin group (between Targets and Dialpad Settings)

**5. Edited `src/components/ProtectedApp.tsx`**
- Add the `/admin/ghl-sync` route, lazy-loaded and wrapped in the existing `AdminRoute` guard

### Out of scope

- Background cron-based daily reconciliation (let's see how the manual run goes first)
- Pulling new GHL-only contacts back into Supabase (your data went GHL → Supabase already; this plan is about restoring the link, not a fresh import)
- Field-level merging of differences between Supabase and GHL data (the live `ghl-webhook` already keeps changes flowing GHL → Supabase)
- Handling phone format mismatches beyond E.164 normalization (already done by `normalize_phone_e164` trigger and the upsert function's AU phone variants)

