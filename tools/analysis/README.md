# FPL analysis tools

Offline scripts for transfer and chip decisions. They're separate from the app:
they download FPL data into `data/` (git-ignored) and print results to the terminal.

## Setup

```bash
cd tools/analysis
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python fetch_history.py               # once: past seasons' per-GW data (~25 MB)
python fetch_data.py --entry 220253   # re-run whenever you want fresh data
python evaluate.py                    # optional: re-test the model (~5 min)
```

## Scripts

| Script | What it does |
|---|---|
| `fetch_data.py` | Downloads bootstrap, fixtures, per-GW live stats for every finished GW, every player's match log this season, your entry's history/transfers/picks, and last-season stats for every regular player. |
| `fetch_history.py` | Downloads past seasons' per-fixture player data (2022-23 on, when FPL added xG) from [vaastav/Fantasy-Premier-League](https://github.com/vaastav/Fantasy-Premier-League) (MIT). |
| `points_model.py` | **The projection model.** Gradient-boosted trees trained on past seasons' match logs; `python points_model.py` shows your squad, `python points_model.py Semenyo Rogers --gws 6` compares players. |
| `evaluate.py` | Walk-forward test of `points_model.py` against points-per-game form on held-out seasons. |
| `history.py`, `features.py` | Load all seasons into one table; build the model's inputs from data available at each deadline only. |
| `team_model.py` | *Legacy model.* Team attack/defence ratings from match xG (shrunk toward average), projected score and clean-sheet odds for next GW's fixtures. |
| `projections.py` | *Legacy model* (`solver.py --legacy`). Expected points per player per GW, by scoring route. `python projections.py` shows your squad; `python projections.py Wissa Gonzalo --gws 10` compares players. |
| `backtest.py` | *Legacy model.* Rebuilds the model as of each past GW, predicts the next one, compares with a points-per-game baseline, and fits the calibration. |
| `solver.py` | Plans squad, XI and captain over several GWs as a mixed-integer program under FPL's rules (budget with real selling prices, 2/5/5/3, 3 per club, free-transfer rollover, 4-point hits, optional wildcard). |

### Solver examples

```bash
python solver.py                                          # best plan for the next 5 GWs (points_model)
python solver.py --horizon 10 --wildcard 6                # wildcard in GW6
python solver.py --max-now 1 --no-hits                    # one free transfer, never a hit
python solver.py --exclude Haaland --keep Szoboszlai      # constraints
python solver.py --force-out "João Pedro"                 # what's the best plan if he goes now?
python solver.py --scenario scenarios.example.json        # injury assumptions
python solver.py --legacy                                 # old hand-built projections
```

Ambiguous names take a team suffix: `King:FUL`. A scenario file maps player
names to per-GW availability (0 = out, 0.75 = 75%); players not listed use FPL's
chance-of-playing for the first GW only.

Comparing two runs (e.g. `--wildcard 6` vs none, or two `--force-out` options)
is the intended way to answer "should I do X": the difference in the printed
totals is the model's estimate of what X is worth.

## How the model works

`points_model.py` predicts a player's points in each upcoming fixture from what
was known at the deadline: minutes and starts (season and last 3 GWs), points
and per-90 xG/xA/bonus/BPS/saves/defensive contributions, last season's
per-90s, price, ownership, position, his team's and the opponent's recent xG
for and against (last 12 fixtures, spanning seasons), home/away, and how many
GWs ahead the fixture is. It's fitted to actual points, so its numbers are on
the real-points scale. The solver retrains it when new data arrives (~40 s,
cached in `data/points_model.pkl`).

## How far to trust it

`evaluate.py` retrains every 5 GWs using only earlier data and predicts each
deadline in seasons it hasn't seen. Results (rank = Spearman correlation with
actual points, "starters" = played 60+ minutes the previous GW):

| Test season | Window | Rank, model vs form | Rank among starters | Top-15 picks, pts/GW |
|---|---|---|---|---|
| 2024-25 | next GW | 0.62 vs 0.53 | 0.33 vs 0.29 | 5.3 vs 4.7 |
| 2024-25 | next 5 GWs | 0.69 vs 0.63 | 0.48 vs 0.45 | 4.6 vs 4.4 |
| 2025-26 | next GW | 0.61 vs 0.49 | 0.24 vs 0.20 | 4.7 vs 4.3 |
| 2025-26 | next 5 GWs | 0.65 vs 0.59 | 0.36 vs 0.34 | 4.1 vs 4.0 |
| 2026-27 GW4-6 | next GW | 0.55 vs 0.46 | 0.18 vs 0.17 | 4.7 vs 4.7 |

So it beats form consistently but modestly; most of FPL is noise. What a
projected gap is worth, from 2025-26 out-of-sample predictions for regular
starters in the same position over the next 5 GWs:

| Model's gap | Favoured player outscores the other |
|---|---|
| under 1 pt | 51% |
| 1–2 pts | 55% |
| 2–3 pts | 58% |
| 3–5 pts | 62% |
| 5–8 pts | 68% |
| 8+ pts | 75% |

(Using form to pick the favourite at the same gaps: 51/53/54/58/61/68%.)

Practical rules:

- **Under ~2 points over 5 GWs is a coin flip.** Decide on news, ownership or price.
- **5+ points is a real but not certain edge** (about two in three).
- The model knows about injuries only through recent minutes, FPL's
  chance-of-playing (applied to the first GW) and `--scenario`.
- Leads beyond 5 GWs reuse the 5-GW-ahead behaviour.
- **Last season tips close calls.** Overall it carries about a quarter of the
  weight this season's numbers do, but for single players it moves a 5-GW
  projection by 4–8 points, more than most gaps between options. Fading it out
  faster as the season goes on was tested and didn't help (by GW7 this season's
  pts/90 already predicts better, and the model learns that from `origin`), so
  override it with judgement when a player's last season clearly doesn't apply.
  A season spent at a PL club without playing counts as no data, not zero.
- FPL's own `xP` in the archive isn't used as a benchmark: it tracks the same
  GW's points far better than the next GW's, so it was recorded after the games.

## The original model (legacy)

`projections.py` (run via `solver.py --legacy`) builds points route by route:
team xG ratings shrunk toward average, per-90 rates shrunk toward the last two
seasons, clean-sheet and defensive-contribution odds, bonus, saves, a start
rate, then a calibration from `backtest.py`. In walk-forward tests on GW3-6 of
2026-27 it ranked players worse than plain points-per-game form (its top-15
picks averaged 4.1 pts/GW vs 4.4), and its calibration slope was ~0.36: only a
third of a projected gap showed up in real points. It's kept for comparison only.
