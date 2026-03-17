

## Gamify the Dashboard

### What exists now
- Plain stat cards (Calls Made, Booked, Follow-ups, Total Leads, Penetration)
- Target progress sections with basic progress bars
- Team Leaderboard (ranked list, no visual flair)
- Live Activity Feed
- Outcome Breakdown grid (flat numbers)
- DailyTarget component (exists but not used on dashboard)

### Plan

**1. Motivational greeting banner with streak & encouragement**
- New `DashboardGreeting` component at the top
- Shows personalized "Good morning, [name]!" with a dynamic motivational message based on today's performance
- Displays a "streak" badge (consecutive days with 1+ calls) using call_logs data
- Uses flame/fire emoji or icon for active streaks

**2. Upgrade StatCard with animated counters and milestone indicators**
- Add a `useAnimatedCounter` hook that counts up from 0 to the target value on mount
- Add colored accent borders/glow when milestones are hit (e.g., 10+ booked = green glow, 50+ calls = blue glow)
- Add small trophy/star icons next to values that exceed thresholds

**3. Enhanced Team Leaderboard with medals, rank badges, and "you" highlight**
- Gold/silver/bronze medal icons for top 3 positions
- Highlight the current user's row with a distinct accent border
- Add a subtle crown icon for #1
- Animated rank position indicator

**4. Target progress cards with celebration states**
- When a target is reached (100%+), show a celebration state: green checkmark, confetti-style border gradient, "Target smashed!" text
- Color-code progress bars: red < 33%, amber 33-66%, green 66%+
- Add percentage milestone markers on the progress bar (25/50/75/100)

**5. Achievement badges section**
- New `AchievementBadges` component below the stats
- Show unlockable badges based on real data:
  - "First Blood" - first call of the day
  - "Hot Streak" - 10+ calls in a row
  - "Closer" - 5+ bookings today
  - "Centurion" - 100+ total calls
  - "Perfect Day" - hit daily target
- Locked badges shown as greyed-out silhouettes
- Unlocked badges pulse briefly on first view

**6. Daily progress ring (replace or augment DailyTarget)**
- Circular progress ring showing today's calls vs target
- Animated fill with color transitions as percentage increases
- Center shows the count with motivational micro-copy

### Files involved
- New: `src/components/dashboard/DashboardGreeting.tsx`
- New: `src/components/dashboard/AchievementBadges.tsx`
- New: `src/components/dashboard/DailyProgressRing.tsx`
- Edit: `src/components/StatCard.tsx` (animated counters, milestone glow)
- Edit: `src/components/TeamLeaderboard.tsx` (medals, user highlight)
- Edit: `src/components/targets/TargetMetricCard.tsx` (celebration states, color-coded progress)
- Edit: `src/pages/DashboardPage.tsx` (compose new widgets)
- Edit: `src/index.css` (add glow/celebration keyframes)

### Technical notes
- Streak calculation: query `call_logs` grouped by date, count consecutive days backwards from today
- Animated counter: `requestAnimationFrame` loop in a custom hook, duration ~800ms
- Achievement logic: pure functions computed from today's call count + total logs, no new DB tables needed
- All gamification is visual/client-side using existing data, no schema changes required

