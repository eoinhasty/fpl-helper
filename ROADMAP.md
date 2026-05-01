# Roadmap

## What's built

### Core
- Squad view (list + pitch layouts) — XI + bench with shirts, price, start% bar, next fixture (FDR colour-coded)
- Player detail sheet — availability, injury news, next 3 fixtures, quick stats
- Team health alert — flags any XI player under 60% start probability

### Beyond MVP
- **Live points** — real-time GW scoring via `/my-team/{id}` (requires bearer token)
- **Captaincy recommendations** — top 3 picks scored on start%, fixture difficulty, form, ICT (shown in Insights carousel)
- **League rankings** — overall rank, GW rank, classic/H2H league positions
- **Hot news feed** — recent injury and transfer news, prioritised by recency
- **PL standings** — live Premier League table (football-data.org or stub fallback)
- **Settings & preferences** — theme, layout, default view, persisted to localStorage
- **Token management** — bearer token set at runtime via Settings panel
- **Cache visibility** — hit/stale/refreshing indicators + data age in the top nav

## Planned

- **Fixture heatmap** — your squad × upcoming GWs (GW+3/+4) with FDR shading, to spot blank/double gameweeks at a glance
- **Market insight** — Insights carousel slide for transfer suggestions, price changes, or ownership trends

## Heuristics reference

### Start probability (v1)
1. Use `chance_of_playing_next_round` (0–100) as multiplier when FPL provides it
2. Fallback: blend status base (`a`=0.88, `d`=0.55, `i/s/n`=0) with minutes/max-minutes ratio
3. News keyword tweaks: "ruled out/surgery/setback" ×0.2 · "doubt/late test/assess" ×0.7 · "fit/back in training" floor 0.9
4. Clamp to [0, 0.99]

### Captaincy scoring (v1)
```
score = start_prob × (10 / 2^(FDR-1))   # exponential FDR penalty
      + 4 if home
      + form × 2
      + ict_index / 10
```
FDR penalty: FDR 1 → ÷1, FDR 2 → ÷2, FDR 3 → ÷4, FDR 4 → ÷8, FDR 5 → ÷16.
