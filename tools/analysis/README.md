# FPL analysis tools

Offline scripts for transfer and chip decisions. They're separate from the app:
they download FPL data into `data/` (git-ignored) and print results to the terminal.

## Setup

```bash
cd tools/analysis
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python fetch_data.py --entry 220253   # re-run whenever you want fresh data
python backtest.py                    # measures accuracy and writes data/calib.json
```

## Scripts

| Script | What it does |
|---|---|
| `fetch_data.py` | Downloads bootstrap, fixtures, per-GW live stats for every finished GW, your entry's history/transfers/picks, and last-season stats for every regular player. |
| `team_model.py` | Team attack/defence ratings from match xG (shrunk toward average), projected score and clean-sheet odds for next GW's fixtures. |
| `projections.py` | Expected points per player per GW, by scoring route. `python projections.py` shows your squad; `python projections.py Wissa Gonzalo --gws 10` compares players. |
| `backtest.py` | Rebuilds the model as of each past GW, predicts the next one, compares with a points-per-game baseline, and fits the calibration. |
| `solver.py` | Plans squad, XI and captain over several GWs as a mixed-integer program under FPL's rules (budget with real selling prices, 2/5/5/3, 3 per club, free-transfer rollover, 4-point hits, optional wildcard). |

### Solver examples

```bash
python solver.py                                          # best plan for the next 5 GWs
python solver.py --horizon 10 --wildcard 6                # wildcard in GW6
python solver.py --max-now 1 --no-hits                    # one free transfer, never a hit
python solver.py --exclude Haaland --keep Szoboszlai      # constraints
python solver.py --force-out "João Pedro"                 # what's the best plan if he goes now?
python solver.py --scenario scenarios.example.json        # injury assumptions
```

Ambiguous names take a team suffix: `King:FUL`. A scenario file maps player
names to per-GW availability (0 = out, 0.75 = 75%); players not listed use FPL's
chance-of-playing for the first GW only.

Comparing two runs (e.g. `--wildcard 6` vs none, or two `--force-out` options)
is the intended way to answer "should I do X": the difference in the printed
totals is the model's estimate of what X is worth.

## How projections work

- **Team strength:** each team's xG for/against per game, relative to league
  home/away averages, with 4 pseudo-games at average (FPL's own strength ratings
  are zeroed this season).
- **Player rates:** xG/xA per 90 blended with the player's last two PL seasons
  (900-minute weight), or his position's average (450-minute weight) if he has
  under 900 PL minutes. Opponent and venue adjust the attacking rates.
- **Other routes:** clean sheet and goals-conceded odds from the team model,
  defensive-contribution hit rate (10 CBIT for DEF, 12 CBIRT for MID/FWD) and
  bonus rate, both shrunk toward priors; saves for keepers.
- **Minutes:** start rate = half season-long, half the last three GWs.
- **Calibration:** raw projections are mapped to `a + b × raw` using the backtest fit.

## How far to trust it

As of GW5 the backtest shows the model only modestly beats a naive
points-per-game baseline (mean error 2.55 vs 2.71 points, top-15 picks 4.5 vs 4.2
points), with rank correlation around 0.15 for both — single-GW FPL scores are
very noisy. The calibration slope is ~0.37 (95% CI 0.20–0.56): only about a third
of a projected gap between two players shows up in real points, which is why the
solver works on calibrated numbers.

Practical rules:

- **Treat differences under ~3 points over a 10-GW horizon as ties.** Several
  options routinely land within that band (e.g. which of two injured forwards to
  sell first, or which £5.5–6m forward to buy) and the pick among them can flip
  with small data changes. Decide ties on things the model doesn't see: news,
  ownership/rank risk, price changes.
- Players with no PL history (promoted clubs, new signings) lean on positional
  averages — their projections are the least reliable.
- The model has no view of rotation beyond start rates, ignores price changes,
  and knows about injuries only through `--scenario` and FPL's chance-of-playing.
- Re-run `backtest.py` after each gameweek; the calibration should tighten as
  the season's sample grows.
