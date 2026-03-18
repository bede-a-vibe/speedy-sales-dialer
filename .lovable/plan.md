

# Backend and Project Simplification Plan

## Current State Assessment

The backend is **currently working** — network requests return 200s, data is flowing, and the user is logged in. The earlier "loading" issue was resolved by adding session timeouts. The "vite server connection lost" message in console is from a build restart, not a runtime failure.

The project is well-structured but has accumulated complexity in several areas. Here is where weight can be reduced and reliability strengthened.

---

## 1. Remove Dead Auth Abstraction Layer (`src/lib/auth.ts`)

**Problem**: `auth.ts` exports `authBrowserClient`, `createPrimaryStorageAuthClient` (deprecated), and `createTransientAuthClient` — all of which just return the same `supabase` client. This is leftover scaffolding that adds confusion.

**Fix**: Strip `auth.ts` down to only the utility functions that are actually needed:
- Keep: `clearLocalAuthStorage`, `resetLocalAuthState`, `withTimeout`, `AUTH_REQUEST_TIMEOUT_MS`
- Remove: `authBrowserClient`, `createPrimaryStorageAuthClient`, `createTransientAuthClient`
- Update any imports in `AuthPage.tsx` and `ResetPasswordPage.tsx` to use `supabase` directly (they already do)

**Impact**: Eliminates the illusion of multiple auth clients, reduces future confusion.

---

## 2. Remove Mock Data (`src/data/mockData.ts`)

**Problem**: `mockData.ts` contains `MOCK_CONTACTS` (30 fake contacts) and `MOCK_CALL_LOGS` that are never used at runtime — all data comes from the database. The file also contains actually-used exports (`INDUSTRIES`, `OUTCOME_CONFIG`, `normalizeIndustryValue`, `CallOutcome`).

**Fix**: 
- Move `INDUSTRIES`, `INDUSTRY_ALIASES`, `normalizeIndustryValue`, `CallOutcome`, and `OUTCOME_CONFIG` into a new `src/data/constants.ts`
- Delete `MOCK_CONTACTS`, `MOCK_CALL_LOGS`, and the fake `Contact`/`CallLog` interfaces from `mockData.ts`
- Update all imports across the project

**Impact**: Removes ~70 lines of dead code and eliminates the confusing `Contact` type shadow (mock vs database).

---

## 3. Deduplicate Shared Utility Functions

**Problem**: `getTalkTimeSeconds` and `ANSWERED_OUTCOMES` are defined identically in both `src/lib/reportMetrics.ts` and `src/lib/hourlyMetrics.ts`.

**Fix**: Export them once from `reportMetrics.ts` and import in `hourlyMetrics.ts`.

**Impact**: Single source of truth for call outcome logic.

---

## 4. Simplify `useContacts.ts` — Remove Unused Hooks

**Problem**: The file exports 4 different contact-fetching hooks plus the rolling dialer queue. Several hooks fetch ALL contacts in batches (`useContacts`, `useAllContacts`, `useUncalledContacts`) which is expensive and may not all be actively used.

**Fix**:
- Audit which hooks are actually imported (search for usage)
- Remove any unused batch-fetch hooks
- The rolling dialer queue (`useRollingDialerQueue`) is the primary mechanism — confirm `useDialerContacts` is also still needed or can be removed

**Impact**: Reduces unnecessary large queries and simplifies the contact data layer.

---

## 5. Consolidate `import-builders` Edge Function

**Problem**: The `import-builders` edge function duplicates logic that already exists client-side in `src/lib/contactImport.ts` (state normalization, field mapping, deduplication). It's a 290-line function that parses XLSX/Markdown and inserts contacts.

**Fix**: 
- If this function is still actively used, keep it but remove the Markdown parsing path (which was for an early one-time import)
- If it's been superseded by the client-side `UploadPage.tsx` flow, consider removing it entirely
- At minimum, align the CORS headers with the standard pattern (missing several required headers)

**Impact**: Reduces edge function maintenance surface.

---

## 6. Harden the Dialpad Edge Function (1562 lines)

**Problem**: This is the heaviest file in the project. While well-organized, it has reliability risks:
- `createClient()` is called repeatedly for each admin operation (lines 867, 1058, 1125, 1344, 1492, 1524) — creating a new Supabase client instance every time
- The `sync_users` action does sequential API calls per user with no parallelism or error batching
- Console logging is verbose in production

**Fix**:
- Create the admin client once at the top of the authenticated handler block and reuse it
- This reduces object allocation and connection overhead per request
- No functional change, just cleaner resource management

**Impact**: Fewer allocations per edge function invocation, more predictable resource usage.

---

## 7. Add `staleTime` to Frequently-Polled Queries

**Problem**: Several React Query hooks refetch aggressively:
- `useCallLogs` refetches every 15s and fetches up to 500 rows
- `usePerformanceTargets` has no `staleTime` (refetches on every window focus)
- `useUserRole` has no `staleTime`

**Fix**:
- Add `staleTime: 30_000` to `usePerformanceTargets` and `useUserRole` — these rarely change
- Consider increasing `useCallLogs` interval to 30s for the dashboard view

**Impact**: Fewer redundant database queries, especially on page navigation.

---

## 8. Clean Up `ProtectedApp.tsx` — Lazy-Load Heavy Pages

**Problem**: `ProtectedApp.tsx` eagerly imports all 9 page components at the top level. When the user navigates to `/dialer`, all pages (Dashboard, Reports, Contacts, etc.) are bundled into the initial chunk.

**Fix**:
- Lazy-load `DialerPage`, `ReportsPage`, `ContactsPage`, and `PipelinesPage` (the heaviest pages) using `React.lazy()`
- Keep `DashboardPage` eagerly loaded since it's the default route
- Wrap lazy routes in `<Suspense>` with the existing `FullPageLoading` fallback

**Impact**: Faster initial page load, smaller JS chunks per route.

---

## Summary of Changes

| Area | Action | Files |
|------|--------|-------|
| Auth layer | Remove dead abstractions | `src/lib/auth.ts` |
| Mock data | Extract constants, delete fakes | `src/data/mockData.ts` → `src/data/constants.ts` |
| Shared utils | Deduplicate `getTalkTimeSeconds` | `src/lib/hourlyMetrics.ts`, `src/lib/reportMetrics.ts` |
| Contact hooks | Remove unused hooks | `src/hooks/useContacts.ts` |
| Import function | Remove dead code paths, fix CORS | `supabase/functions/import-builders/index.ts` |
| Dialpad function | Reuse admin client | `supabase/functions/dialpad/index.ts` |
| Query tuning | Add staleTime | `src/hooks/usePerformanceTargets.ts`, `src/hooks/useUserRole.ts` |
| Code splitting | Lazy-load heavy pages | `src/components/ProtectedApp.tsx` |

All changes are non-breaking refactors that reduce code weight and improve reliability without changing any user-facing behavior.

