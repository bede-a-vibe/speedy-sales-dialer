

## CRM Improvements: Contact Detail Page + Dashboard Quick Stats

### 1. Contact Detail Page (`/contacts/:id`)

Create a dedicated full-page view for a single contact that consolidates all information in one place.

**New file: `src/pages/ContactDetailPage.tsx`**
- Fetch contact by ID from URL param using `supabase.from("contacts").select("*").eq("id", id).single()`
- Layout sections:
  - **Header**: Business name, industry badge, status badge, contact person, phone (click-to-call), email, website, GMB link, location
  - **Actions bar**: Edit button (opens existing edit dialog logic), Mark DNC toggle, Quick Book button
  - **Two-column layout below**:
    - **Left column**: Call history (reuse `useContactCallLogs`), Notes timeline (reuse `usePaginatedContactNotes`) with inline "add note" textarea
    - **Right column**: Pipeline items timeline (reuse `useContactPipelineItems`), contact metadata (created date, call attempt count, last outcome)
- Back button to return to `/contacts`

**Routing (`src/components/ProtectedApp.tsx`)**:
- Add route: `<Route path="/contacts/:id" element={<ContactDetailPage />} />`

**Link from ContactsPage**:
- Make the business name in each contact row a clickable `<Link to={/contacts/${id}>` so users can navigate to the detail page

### 2. Dashboard Quick Stats

Add an actionable stats row to the dashboard between the greeting and achievements sections.

**New file: `src/components/dashboard/DashboardQuickStats.tsx`**
- Fetch data using existing hooks:
  - `usePipelineItems("follow_up", "open")` — count items where `scheduled_for <= today`
  - `usePipelineItems("booked", "open")` — count items where `scheduled_for <= today` (overdue) or today
  - `useCallLogs()` — derive "calls today" count (already available via `useTodayCallCount`)
- Display 3-4 cards:
  - **Follow-ups Due Today** — count + link to `/pipelines?tab=follow_up`
  - **Overdue Appointments** — count + link to `/pipelines?tab=booked`
  - **Today's Bookings** — count of booked items scheduled today
  - **Calls Made Today** — already shown in progress ring, but a quick numeric card links to `/reports`
- Each card is clickable, navigating to the relevant page

**Integration (`src/pages/DashboardPage.tsx`)**:
- Insert `<DashboardQuickStats />` between `<DashboardGreeting />` and `<DailyAchievements />`

### Files to create/edit

| File | Action |
|------|--------|
| `src/pages/ContactDetailPage.tsx` | Create — full contact detail page |
| `src/components/dashboard/DashboardQuickStats.tsx` | Create — quick stats row |
| `src/components/ProtectedApp.tsx` | Edit — add `/contacts/:id` route |
| `src/pages/ContactsPage.tsx` | Edit — link business names to detail page |
| `src/pages/DashboardPage.tsx` | Edit — add DashboardQuickStats component |

No database changes required — all data is already available via existing tables and hooks.

