
Implementation plan

Goal
- Reduce dialer initial load by splitting heavy, non-critical UI into lazy-loaded chunks.
- Make the power dialer feel faster by preloading the next contact’s detail data and preparing the next step before the rep advances.

What I’ll build

1. Lazy-load the heavy dialer side panels
- Split these into separate components loaded with `React.lazy` + `Suspense`:
  - Dialpad sync panel
  - Notes/history panel
  - Session summary modal
- Keep the core dialer shell, current contact card, outcome buttons, and call controls in the main bundle.
- Show lightweight skeleton fallbacks while each panel chunk loads.

2. Preload the next contact in the power dialer
- Compute `nextContact` from the rolling queue on every step.
- Start warming the next contact’s note/summary data in the background as soon as the current contact is active.
- Keep current-contact note loading lazy, but also prefetch next-contact data so advancing feels instant.

3. Make lead advancement more immediate
- Move “next contact ready” work off the critical path:
  - precompute next contact id
  - prefetch next notes/query cache
  - trigger `ensureBuffer()` earlier while current lead is still active
- Avoid waiting for panel mounts or note fetches after skip/log before showing the next lead.

4. Preload lazy chunks before they are needed
- When a session starts, warm the lazy imports for:
  - sync panel
  - notes panel
  - summary modal
- This keeps the initial page bundle smaller, while avoiding a visible delay the first time each panel appears.

Files to change
- `src/pages/DialerPage.tsx`
- `src/hooks/useContactNotes.ts`
- `src/hooks/useContacts.ts`
- New components, likely:
  - `src/components/dialer/DialpadSyncPanel.tsx`
  - `src/components/dialer/ContactNotesPanel.tsx`
  - `src/components/dialer/SessionSummaryDialog.tsx`

Design approach
- Refactor `DialerPage` so it orchestrates state only.
- Move panel-specific data fetching into the lazy components where possible.
- For next-contact warming, expose either:
  - a `prefetchContactNotes(contactId)` helper from the notes hook area, or
  - a query-key helper so `DialerPage` can prefetch via React Query cleanly.

Technical details
- Use `React.lazy(() => import(...))` and `Suspense` fallbacks for all 3 panels.
- Keep `ContactCard`, outcome selection, call controls, and queue header eagerly loaded.
- Add a next-contact prefetch effect similar to:
  - when `currentContact` changes
  - derive `nextContact`
  - prefetch next contact notes/transcript query
  - warm lazy chunk imports if dialing is active
- Consider lowering current-contact note delay slightly once prefetching exists, because prefetched data should hit cache.
- In the rolling queue hook, trigger background refill before the buffer gets visibly low so “next lead” never waits on a claim round-trip.

Expected result
- Smaller initial dialer bundle
- Faster first render of the dialer page
- Faster first interaction after clicking Start Dialing
- Near-instant transitions to the next lead because both the queue and the next lead’s detail data are already warming in the background

Validation
- Confirm the dialer page loads faster before a session starts.
- Confirm the first open of notes/sync/summary shows either instantly or with a brief skeleton only once.
- Confirm skipping/logging moves to the next lead without waiting for note/transcript fetches.
- Confirm next-contact prefetch does not break queue locking or fetch stale notes for the wrong contact.
