# Shared test cases

Cases for logic that exists twice, once in the backend and once in the
frontend. Both test suites read these files, so a rule changed on one side
only fails CI:

- `auto_subs.json`: FPL's auto-sub rules, `mini_league.auto_subs` (backend)
  and `autoSubs` in `frontend/src/lib/autoSubs.ts`. Each element id is its
  squad slot (1–11 the XI in order, 12–15 the bench in order), `positions`
  gives each slot's FPL element type (1 GK, 2 DEF, 3 MID, 4 FWD), `blank` the
  slots whose players didn't play (every match is over) and `subs` the
  expected `[out, in]` pairs in the order FPL makes them.
- `fdr_factor.json`: the captaincy/transfer fixture multiplier, `FDR_FACTOR`
  in `scoring.py` and `fdrFactor` in `frontend/src/lib/utils.ts`.
- `constants.json`: constants both sides define.
