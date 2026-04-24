## Plan: Custom multi-filter benchmark segments — final

### What you'll get

A new **"Segments"** mode in the Custom Monitor toolbar (sitting alongside the existing Single and By-Dimension modes). In Segments mode, every row in the table is a **custom segment** you've defined — a saved combination of filters from the dialer's vocabulary, like:

- **Segment A**: NSW · Plumbers · 6-15 employees · Has Google Ads
- **Segment B**: VIC · Electricians · Sole trader · Hot tier
- **Segment C**: All Builders · Mobile · No DM phone captured

Each segment becomes one row in the same table, with whatever metric columns you've already selected (Dials, Pickups, Conversations, Pickup → Booking, etc.), sortable by any column, with a Total row at the bottom and best/worst per column highlighted (green/red) like the existing Breakdown table.

### Persistence: private by default, opt-in team sharing

Per your answer:

- **Private segments** live in `localStorage` keyed by user (`funnel:benchmark-segments:<userId>:v1`). Instant CRUD, no infra.
- **Team-shared segments** live in a new Supabase table `benchmark_segments` with RLS so any authenticated user can read all shared segments, but only the creator (or admin) can edit/delete.
- The editor dialog has a **"Share with team"** switch. Off = private (localStorage). Toggling on promotes the segment to the database; toggling off pulls it back to localStorage.
- The toolbar shows both lists merged, with a small icon distinguishing the two: 👤 private vs 👥 team. Sort: team segments first (everyone benefits), then your private ones.

#### New table: `benchmark_segments`

```sql
create table public.benchmark_segments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text,                          -- optional accent for the row label
  filters jsonb not null default '{}',  -- the Segment.filters shape (typed in TS)
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.benchmark_segments enable row level security;

-- Anyone authed can see team segments (it's a reporting table, low sensitivity)
create policy "Authenticated users can view shared segments"
  on public.benchmark_segments for select to authenticated using (true);

-- Only the creator can insert their own (created_by must match the caller)
create policy "Users can insert own segments"
  on public.benchmark_segments for insert to authenticated
  with check (auth.uid() = created_by);

-- Creator OR admin can update / delete
create policy "Creator or admin can update segments"
  on public.benchmark_segments for update to authenticated
  using (auth.uid() = created_by or has_role(auth.uid(), 'admin'::app_role))
  with check (auth.uid() = created_by or has_role(auth.uid(), 'admin'::app_role));

create policy "Creator or admin can delete segments"
  on public.benchmark_segments for delete to authenticated
  using (auth.uid() = created_by or has_role(auth.uid(), 'admin'::app_role));

-- Trigger to keep updated_at fresh
create trigger benchmark_segments_set_updated
  before update on public.benchmark_segments
  for each row execute function public.update_updated_at_column();
```

This re-uses the existing `has_role(...)` security-definer function and `update_updated_at_column()` trigger, so no new helpers needed. Low sensitivity: a "segment" is just a saved filter combo — there's no PII in it.

### How segments are evaluated (per row)

For each segment, we filter the already-loaded `callLogs` and `bookedItems` to rows whose joined `contacts` row matches every condition in the segment, then run `getReportMetrics(...)` on that subset. Same code path the existing By-Dimension benchmark uses — so:

- **Same metric formulas** as everywhere else, including the conversation-tagging launch-date clipping you locked in earlier.
- **Same date range** as the page-level toolbar.
- **Same rep filter** as the page-level toolbar.
- **No new database queries for the metrics themselves** — the `contacts(...)` join already pulls every column we need (`trade_type, state, business_size, work_type, prospect_tier, buying_signal_strength, phone_type, has_google_ads, has_facebook_ads, dm_phone, gbp_rating, review_count`).

A separate small query computes a **"contacts matching this segment overall"** count (independent of date range, like the dialer's match count) so each segment row also shows segment size — useful sanity check for "is my segment 5 contacts or 5,000?".

### Empty-row behavior

Per your answer: **always show every active segment**, even when it has zero dials in the date range. Predictable, no toggle. Empty rows render with `—` in metric columns and a muted style so they don't distract.

### UI: the Custom Monitor toolbar

Three-mode toggle replacing today's implicit "is benchmark-dim set?" check:

```
[Single | By Dimension | Segments]   [+ New Segment]   | Table | Cards | Customize columns
```

- **Single** — today's default, one row, no comparison.
- **By Dimension** — today's existing dropdown-driven benchmark.
- **Segments** — the new mode.

When **Segments** is active:

- A chip strip below the toolbar lists every segment (private + team), each clickable to edit, with `✕` to remove. Inactive segments (none yet) → empty state with a "Create your first segment" button.
- `[+ New Segment]` opens the editor dialog.
- "Compare to previous period" stays mutually exclusive with Segments mode (same disabled-with-tooltip pattern as today's By-Dimension mode).

### The "New / Edit Segment" dialog (modal, like Customize Columns)

Mirrors the dialer's `AdvancedFilters` vocabulary so reps recognize every field:

| Field | Control | Source of options |
|---|---|---|
| Name (required) | Text input | — |
| State | MultiSelect | `AUSTRALIAN_STATES` |
| Industry / Trade | MultiSelect | `INDUSTRIES` + `TRADE_TYPES` (combined like the dialer) |
| Work Type | Select (incl. "Any") | `WORK_TYPES` |
| Business Size | Select | `BUSINESS_SIZES` |
| Prospect Tier | Select | `PROSPECT_TIERS` |
| Buying Signal | Select | `BUYING_SIGNAL_OPTIONS` |
| Phone Type | Select | `PHONE_TYPE_OPTIONS` |
| Has Google Ads | Select | `AD_STATUS_OPTIONS` |
| Has Facebook Ads | Select | `AD_STATUS_OPTIONS` |
| Has DM Phone | Select | `DM_STATUS_OPTIONS` |
| Min GBP Rating | Number input | `GBP_RATING_OPTIONS` |
| Min Review Count | Number input | `REVIEW_COUNT_OPTIONS` |
| **Share with team** | Switch | — |

Top of the dialog: a **"Copy from current dialer filters"** button — when present, it reads the dialer's filter blob from `localStorage` (the dialer already persists filters there per `readStoredDialerFilters` in `DialerPage.tsx`) and pre-fills the form. Disabled with a tooltip when no filters are stored yet.

Bottom of the dialog: a live **"X contacts match these filters"** count (matches the dialer Filters panel ergonomic). Computed by re-using the dialer's existing `get_dialer_queue_count` RPC — but in *non-queue mode* by passing all the filters and skipping the queue-only constraints. Actually simpler: just run a head `count` query on `contacts` with the segment's WHERE clauses. Implemented as a small `countContactsForSegment(segment)` helper that reuses the same param shape.

### Segment row display

```
┌─────────────────────────────┬────────┬─────────┬───────────────┬──────────────┐
│ SEGMENT                     │ DIALS  │ PICKUPS │ PICKUP→BOOK   │ TALK/CONV    │
├─────────────────────────────┼────────┼─────────┼───────────────┼──────────────┤
│ 👥 NSW Plumbers (Hot)        │  284   │   93    │   3.2%        │   4:12       │
│   NSW · Plumbers · Hot      │        │         │               │              │
├─────────────────────────────┼────────┼─────────┼───────────────┼──────────────┤
│ 👥 VIC Electricians (Ads)   │ 2,150  │  776    │   1.4%        │   3:48       │
│   VIC · Electricians · Goog │        │         │               │              │
├─────────────────────────────┼────────┼─────────┼───────────────┼──────────────┤
│ 👤 All Builders (Mobile)    │   26   │    7    │   0%          │   0:54       │
│   Builders · Mobile         │        │         │               │              │
├─────────────────────────────┼────────┼─────────┼───────────────┼──────────────┤
│ 👤 NSW Hot · Sole Trader    │   —    │    —    │     —         │     —        │
│   NSW · Hot · Sole trader   │        │         │               │              │
├─────────────────────────────┼────────┼─────────┼───────────────┼──────────────┤
│ Total                       │ 2,460  │  876    │   1.6%        │   3:55       │
└─────────────────────────────┴────────┴─────────┴───────────────┴──────────────┘
```

The 👥/👤 icon shows team vs private. Hovering a row reveals an Edit pencil and a small `✕`. Best/worst per column tinted green/red, only when ≥3 segments have non-zero data (same threshold as the existing Breakdown table).

### How this coexists with what's already there

- **Single mode** = today's default. Unchanged.
- **By-Dimension mode** = today's "Compare by Industry / State / …" picker. Unchanged.
- **Segments mode** = new.
- The mode state defaults to "Single" so existing users see no change on first load.
- The existing `benchmarkDim`/`benchmarkValuesByDim` localStorage keys keep working — no migration needed.

### Files I'll touch

1. **`src/lib/benchmarkSegments.ts` (new, ~180 lines)**
   - `Segment` type (matches the table's `filters` jsonb shape).
   - `matchSegmentForCallLog(log, segment)` and `matchSegmentForBooking(item, segment)` — pure JS predicates against the joined `contacts` row.
   - `summarizeSegmentFilters(segment)` → short subtitle like `"NSW · Plumbers · Hot"`.
   - `useSegmentsStore()` hook — merges localStorage (private) + Supabase query (team), exposes `create / update / delete / toggleShared`.
   - `countContactsForSegment(segment)` — `supabase.from("contacts").select("id", { head: true, count: "exact" })` with the segment's WHERE clauses.

2. **`src/components/funnel/SegmentEditorDialog.tsx` (new, ~280 lines)**
   - Modal form using `Dialog`, `Select`, `MultiSelect`, `Switch`, `Input`.
   - "Copy from current dialer filters" button reading the same `STORAGE_KEY` the dialer writes.
   - Live "X contacts match" footer using `countContactsForSegment`.

3. **`src/components/funnel/CustomStatGrid.tsx`**
   - Replace the implicit two-mode logic with a `mode: "single" | "dimension" | "segments"` state.
   - Add the three-button mode toggle, the segment chip strip, the `[+ New Segment]` button.
   - Add a new `SegmentTableView` component (sibling of `BenchmarkTableView`/`TableView`) — same column structure, segment-name + filter-summary first column.

4. **`src/pages/CallFunnelPage.tsx`**
   - Wire in `useSegmentsStore()`.
   - For each active segment, compute `ReportMetrics` via `getReportMetrics(...)` after pre-filtering `callLogs` and `bookedAppointments` with `matchSegmentForCallLog` / `matchSegmentForBooking`.
   - Pass `segments` and `segmentRows` into `CustomStatGrid`.

5. **Migration: create `benchmark_segments` table + RLS** (the SQL block above).

### What this does NOT change

- Dialer, dashboard, targets, follow-ups, contacts, reports SOP page — unchanged.
- The conversation-tagging launch-date clipping — preserved (rides on the same `getReportMetrics` calls).
- Funnel chart, Conversion Rate Strip, Trend chart, Stage Drop-Off panel, existing Breakdown table — unchanged.
- Single-mode and By-Dimension mode in the Custom Monitor — unchanged, just gated behind a mode toggle.

### Out of scope

- **Auto-suggested segments** — none. Reps create their own.
- **Comparing the same segment across two date ranges** — that's a date-vs-date comparison, separate feature.
- **Dialer-side "dial this segment now" buttons** — would require queue/scoring changes; great follow-up but not in this change.
- **Segment groups / folders** — flat list in v1.
- **Editing team segments by non-creators** — only the creator (or an admin) can edit a team segment. Others see them read-only.