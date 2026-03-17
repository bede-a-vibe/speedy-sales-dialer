

## Simplify Power Dialer — Remove Timer, Streamline Actions

### What changes

1. **Remove the 30-second auto-advance timer** — Delete the two `useEffect` blocks (lines 867-914) that manage `cooldownSecondsLeft` and `pendingAutoOutcome`, plus the countdown UI (lines 1322-1328). Remove related state variables `pendingAutoOutcome` and `cooldownSecondsLeft`.

2. **Ensure hangup on every transition** — Both `skipLead` and `logAndNext` already cancel active calls before proceeding. Verify `logAndNext` always hangs up even if the call appears terminal (belt-and-suspenders). `pauseSession` already hangs up too.

3. **Remove the ContactNotesPanel from the dialer layout** — Delete the `Suspense`-wrapped `ContactNotesPanel` block (lines 1171-1178). Keep the `notes` state but only show a notes `Textarea` when `selectedOutcome === "follow_up"`. This replaces the always-visible heavy notes panel with a simple inline input.

4. **Remove unnecessary lazy imports** — Remove `loadContactNotesPanel` and its lazy wrapper since the full panel is no longer used. The inline textarea needs no lazy loading.

### Files to edit

- **`src/pages/DialerPage.tsx`** — All changes above. Approximately:
  - Remove `pendingAutoOutcome`, `cooldownSecondsLeft` state declarations
  - Remove auto-advance useEffect blocks (lines 867-914)
  - Remove countdown UI (lines 1322-1328)
  - Remove `ContactNotesPanel` lazy import and its `Suspense` block
  - Add a simple `Textarea` for notes, only visible when outcome is `follow_up`
  - Clean up unused imports

### Technical details

- `skipLead` (line 632): Already calls `cancelActiveCall()` if call is active. No change needed.
- `logAndNext` (line 469): Already calls `cancelDialpadCall.mutateAsync` if call is active. No change needed.
- The `notes` field will still be passed to `createCallLog` and `createPipelineItem` as before — it just won't be editable unless "Follow Up" is selected.
- `ContactNotesPanel` import and prefetch calls for notes history remain intact for other pages; we just stop rendering it in the dialer.

