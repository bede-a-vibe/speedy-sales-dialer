
Diagnosis summary

The problem is not just one bug. I found two separate failures happening at the same time:

1. Backend/database health is currently degraded
2. The frontend auth architecture is still creating auth-client conflicts and eager-loading too much on the login route

What I found

1. Backend is timing out independently of the UI
- A direct backend read (`select now()`) failed with:
  `status 544: Failed to run sql query: Connection terminated due to connection timeout`
- Project metadata reads are also failing with the same timeout in the provided backend context.
- This means the backend is at least partially unavailable right now, even before we blame the app code.

2. Runtime auth requests are failing at the transport layer
- Client console logs show:
  - `TypeError: Failed to fetch`
  - `AuthRetryableFetchError: Failed to fetch`
  - `Lock broken by another request with the 'steal' option`
- Those errors indicate the auth library is both:
  - failing network requests, and
  - fighting over the same auth storage/lock state.

3. `/auth` still loads the protected app bundle and auth-dependent modules
- `src/App.tsx` imports all protected pages and admin hooks directly at the top level.
- Even though `/auth` renders `AuthPage`, Vite/React still loads a large amount of app code for that route.
- The browser network log for `/auth` confirms many protected page scripts are being loaded on the sign-in screen.
- That increases the chance that modules touching the shared backend client initialize on the login page before the user signs in.

4. There are still two persistent auth clients in the app
- `src/lib/auth.ts` defines `authBrowserClient`
- `src/integrations/supabase/client.ts` defines another persistent client using the same local storage auth session
- Any code importing the generated shared client can trigger session recovery/refresh in parallel with `authBrowserClient`
- That matches the runtime lock error:
  `Lock broken by another request with the 'steal' option`

5. Login route isolation is incomplete
- The attempted `ProtectedApp.tsx` split exists, but `src/App.tsx` still contains the old protected-route implementation inline.
- So the architectural fix was started but not completed.
- As long as `/auth` imports route logic that also imports hooks/pages using the shared backend client, the login screen is not truly isolated.

Most likely root cause

Primary root cause:
- The backend is currently unhealthy/intermittently unavailable, which is enough by itself to cause login, password reset, and general loading failures.

Secondary app-level root cause:
- The frontend still has a duplicated auth-client setup plus incomplete route isolation, which causes lock contention and makes auth more fragile, especially when the backend is already slow.

Why “loading” is also broken
- On `/auth`, the app still downloads protected pages and hooks.
- Some of those ultimately depend on the shared backend client with persisted auth state.
- That can kick off background session recovery on page load.
- At the same time, `AuthPage` uses a separate auth client and also clears local storage.
- Result: competing auth flows, lock stealing, and spinner/timeout behavior.

Recommended fix plan

Phase 1 — stabilize the frontend auth path
- Finish isolating protected routes into `src/components/ProtectedApp.tsx`
- Simplify `src/App.tsx` so `/auth` and `/reset-password` import only public auth pages
- Remove the duplicated inline protected routing from `src/App.tsx`
- Prevent protected page modules from loading on the login route

Phase 2 — eliminate auth-client lock contention
- Standardize on one persisted browser auth client for authentication state
- Audit imports that use `@/integrations/supabase/client` on public auth routes and ensure they are not pulled into `/auth`
- Keep transient non-persistent clients only for truly isolated one-off flows if needed
- Ensure reset/login cleanup does not race a second persistent client

Phase 3 — add graceful backend failure handling
- Surface a clear “backend temporarily unavailable” state on login/reset instead of generic timeout text
- Fail fast when the backend health check is down
- Avoid long spinner states when auth/network calls are already known to be failing

Phase 4 — verify backend health before declaring fixed
- Recheck backend query responsiveness
- Re-test login and password reset only after backend responses are healthy
- If backend timeouts persist, the frontend refactor will reduce lock errors but cannot fully restore auth until backend health recovers

Files I would change
- `src/App.tsx`
  - remove inline protected-route tree
  - use the existing `src/components/ProtectedApp.tsx`
- `src/components/ProtectedApp.tsx`
  - keep as the single protected app entrypoint
- `src/lib/auth.ts`
  - consolidate auth client behavior and reduce storage/lock conflicts
- `src/pages/AuthPage.tsx`
  - add explicit unavailable-state handling
- `src/pages/ResetPasswordPage.tsx`
  - same failure handling for backend outages

Technical notes
```text
Current issue chain:

/auth route
  -> App.tsx imports protected routes/pages/hooks
  -> those import shared persistent backend client
  -> shared client attempts session recovery/refresh
  -> AuthPage also uses authBrowserClient and local cleanup
  -> lock contention + fetch failures
  -> when backend is slow/down, both flows amplify the problem
```

Confidence assessment
- High confidence that backend instability is real and current
- High confidence that duplicated persistent auth clients are causing lock contention
- High confidence that route isolation is incomplete and contributes to the issue
- Lower confidence that transport alone is the remaining root cause, because the backend itself is timing out now

Expected outcome after implementation
- `/auth` becomes lightweight and no longer initializes protected backend code
- lock contention errors should disappear
- users will get clearer failure messages during backend outages
- once backend health is restored, login/reset should behave normally again

<lov-actions>
<lov-suggestion message="Test the login and forgot-password flow end-to-end after the auth route isolation and client consolidation changes.">Verify that it works</lov-suggestion>
<lov-suggestion message="Finish isolating protected routes by wiring App.tsx to use the existing ProtectedApp component and removing eager imports from the login route.">Complete Auth Isolation</lov-suggestion>
<lov-suggestion message="Consolidate the app onto a single persisted browser auth client and remove auth lock contention between public auth pages and the shared backend client.">Unify Auth Client</lov-suggestion>
<lov-suggestion message="Add a backend status/error panel on the auth and reset-password pages so users see when the backend is temporarily unavailable instead of generic timeouts.">Add Backend Status UI</lov-suggestion>
<lov-suggestion message="Add a lightweight backend health check and fail-fast retry guidance before running login and password reset requests.">Add Health Checks</lov-suggestion>
</lov-actions>
