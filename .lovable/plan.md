
Problem
- The dialer is timing out on industry changes because it still loads too much data, not because the industry labels are wrong.
- I confirmed the database has valid buckets with large volumes: Electricians 32,180 uncalled, HVAC 9,663, Plumbers 4,998, Renovators 4,350, Builders 705.
- The failing network requests are repeated batched reads against `contacts` with `limit=1000` / `offset=1000,2000...`, returning `504 upstream request timeout`.

Why it breaks by industry
1. `DialerPage` runs two contact queries at once:
   - filtered queue: `useUncalledContacts(industry, stateFilter)`
   - unfiltered queue: `useUncalledContacts()`
2. The unfiltered query exists only to build `stateOptions`, but it tries to fetch all 51,896 uncalled contacts.
3. The filtered query also fetches every matching row in 1000-row batches before the dialer can use them.
4. For large industries, those batched requests stack up and the UI either stays empty or feels broken because the requests time out.

Where the issue is in code
- `src/pages/DialerPage.tsx`
  - line 69: filtered queue query
  - line 70: unfiltered queue query causing the biggest load
  - lines 93-96: state options derived from full contact list
- `src/hooks/useContacts.ts`
  - `fetchContactsInBatches()` loops through entire result sets with `.range(...)`
  - good for exports/admin review, but too heavy for an interactive dialer
- `src/components/DailyTarget.tsx`
  - also adds a polling query for call logs; not the main cause, but contributes to load on dialer mount

Plan to fix
1. Replace the dialer’s full-list loading with a lightweight queue strategy
   - Add a dialer-specific hook that fetches only a small page of uncalled contacts for the selected industry/state.
   - Use a page size suitable for active dialing, not full dataset hydration.

2. Stop querying all contacts just to build the state dropdown
   - Remove `useUncalledContacts()` from `DialerPage`.
   - Build state options from a lightweight distinct-state source instead:
     - either a dedicated backend query for distinct states,
     - or a small precomputed list for the selected industry,
     - or reuse the existing Australian state enum if that matches product needs.

3. Make the dialer operate on a rolling queue
   - Keep only the current chunk in memory.
   - When a lead is completed/skipped, advance locally.
   - When the chunk runs low, fetch the next chunk.

4. Separate “admin/browse contacts” fetching from “dialer session” fetching
   - Keep the current batched hooks for contacts management if needed.
   - Introduce a new dialer-focused hook so performance fixes don’t destabilize the contacts page behavior.

5. Reduce extra load on dialer mount
   - Review `DailyTarget` query to avoid joining/fetching more than needed while the dialer is active.
   - If necessary, swap it to a cheaper count-oriented query.

Expected outcome
- Industry switching becomes fast.
- Large industries like Electricians and HVAC no longer blank out or appear broken.
- The dialer starts with a small usable queue instead of waiting for thousands of rows.
- “All industries” remains usable without loading the entire contact table into the browser.

Technical details
```text
Current behavior
Dialer mount
 ├─ fetch uncalled contacts for selected industry in 1000-row batches
 ├─ fetch all uncalled contacts in 1000-row batches
 └─ fetch call logs for daily target
        => repeated 504s

Planned behavior
Dialer mount
 ├─ fetch first N uncalled contacts for selected filters
 ├─ fetch lightweight state options
 └─ fetch lightweight daily target data
        => fast first render, no massive batch loop
```

Files likely to change
- `src/pages/DialerPage.tsx`
- `src/hooks/useContacts.ts` or a new dialer-specific contacts hook
- `src/components/DailyTarget.tsx`
- possibly a small backend query/helper if we add distinct-state or paged queue support

Validation after implementation
- Test Builders, HVAC, Electricians, and All Industries in the dialer.
- Confirm queue counts appear quickly.
- Confirm start dialing works without long empty/loading states.
- Confirm no repeated 504 contact requests in network logs.
