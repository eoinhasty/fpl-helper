# Feature ideas — decision-support roadmap

Brainstormed while scoping what to build next for helping with FPL team
decisions. Not committed to building any of these yet — just captured so
the ideas (and what's already built vs. not) aren't lost between sessions.

## Already fully built (checked 2026-09-25, don't re-propose these)

- **Fixture ticker grid** — `frontend/src/components/fixtures/FdrGrid.tsx`,
  under the Fixtures tab. All 20 teams, sortable, multi-GW, color-coded FDR.
- **Wildcard/squad planner** — `frontend/src/components/planner/DraftPanel.tsx`
  + `PlayerTable.tsx`, under the Planner tab. Budget tracking, position
  quotas, club-limit violations, full draft-building UI.
- **Set-piece takers** — shown in the Planner's `PlayerTable.tsx` (PK/CK/FK
  badges by order).
- **Price momentum (historical)** — `PlayerDetailModal.tsx` shows price
  change "today" and "since start" with up/down indicators.
- **Bonus points** — shown per-player in `PlayerDetailModal.tsx`.
- **Active chip awareness** — `SquadStatusBar.tsx` shows which chip
  (Wildcard/BB/TC/FH) is active for the current gameweek.
- **Bench auto-sub order** — `BenchStrip.tsx` labels the bench "Auto-sub
  priority" and displays it in that order.

## Partially built — real scaffolding to extend, not build from scratch

1. **Auto-sub simulation.** Bench priority order is shown, but nothing
   simulates "if Player X blanks, here's exactly who replaces them and what
   your XI becomes." Needs: FPL's actual auto-sub rules (GK-for-GK only,
   outfield subs walk the bench order while keeping a valid formation),
   applied against live/projected minutes per starter.
2. **Multi-GW captaincy planning.** `CaptaincyCard.tsx` already does
   DGW/BGW detection and scoring, but only for the next GW. Needs: the same
   scoring model run forward 3-5 gameweeks to show a captaincy outlook, not
   just next week's pick.
3. **Chip timing advisor.** The app already shows which chip is active now;
   it doesn't proactively suggest upcoming DGW/BGW windows worth saving a
   chip for. Needs: scan `bootstrap.events` for blank/double patterns ahead
   of the current GW and surface a "good chip window coming up" flag.

## Genuinely new — no existing scaffolding

4. **European fixture rotation risk.** Cross-reference a squad player's
   club against Champions/Europa/Conference League fixtures (already
   fetched via `football_fixtures()`) to flag "this player's club plays in
   Europe N days before your GW." The club-level counterpart to
   International Duty, which already does this for country duty.
5. **Expected-stats regression signal.** `expected_goals`/`expected_assists`
   are in FPL's bootstrap data but not surfaced anywhere in the frontend.
   A player well below their xG/xGI is a buy-low signal; well above is a
   sell-high/regression-risk signal.
6. **Live BPS tracker.** During a live gameweek, show real-time bonus-point
   standings per match rather than waiting for FPL to lock in bonus at
   full-time. Extends the existing live-gameweek infrastructure
   (`live_event` in `service.py`, the Live tab).
7. **Forward-looking price-change prediction.** Distinct from the existing
   historical price-change display — a "likely to rise/fall tonight" signal
   from transfer momentum (`transfers_in_event`/`transfers_out_event`),
   useful for timing a transfer before the price actually moves.

## Status

Not started. Paused here to go check the user's real squad/news instead of
continuing to plan. Revisit this list when ready to pick something to build.
