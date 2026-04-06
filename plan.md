# MVP scope (what it does)

1. **Fetch next GW squad** (XI + bench, C/VC) from `/entry/{id}/event/{next_gw}/picks/`.
2. **Enrich with player info** from `/bootstrap-static/` (name, pos, team, price, status, news, total points, form, ICT).
3. **Show availability**: start% heuristic (v1 — see below) from `status`, `chance_of_playing_next_round`, `minutes`, and `news`.
4. **Show fixture + difficulty** for each player from `/fixtures/?event={gw}` (opponent, H/A, FDR).
5. **One actionable hint**: alert if any XI player has **start% < 0.60** and suggest a higher-start% bench option.

# Minimal UI (three screens)

* **Squad (list)**: player cards → name, pos, price, start% bar, next fixture pill (with FDR).
* **Player detail** (sheet): availability, news, next 3 fixtures, quick stats.
* **Planner heatmap** (GW+3 or +4): your players × upcoming GWs with FDR shading. *(not yet built)*

# Endpoints you'll call

* `GET /api/bootstrap-static/` → players, teams, events (find `is_next == true`)
* `GET /api/entry/{entry_id}/event/{gw}/picks/` → your squad
* `GET /api/fixtures/?event={gw}` → opponents, kickoff, **team\_\*\_difficulty**

# Recommended stack (pragmatic + fast)

**Backend (Python)**

* **FastAPI** + `httpx` (async calls)
* Pydantic models for responses
* Caching with stale-while-revalidate
* Cron Jobs to fetch data periodically

**Frontend**

* **React + Tailwind**
* Dark + light theme

# Fetching & caching etiquette

* **bootstrap-static**: cache 6–12h; refresh once more within 2–4h pre-deadline.
* **picks**: fetch on demand (when you open the app).
* **fixtures (gw)**: fetch when the GW changes (or on demand).
* Add a 500–1000 ms delay if it ever loops per-player endpoints (not required for MVP).

# Starter-likelihood heuristic (v1)

1. **Primary**: use `chance_of_playing_next_round` (0–100) directly when FPL provides it.
2. **Fallback** (field is null, player is fully available):
   * Status base: `a=0.88`, `d≈0.55`, `i/s/n=0`.
   * For `status=a` with real minutes data: blend with play-time ratio → `(status_base + minutes / (played_gws × 90)) / 2`. Catches rotation risk at big clubs.
3. **News tweaks** applied on top:
   * contains "ruled out / surgery / setback" → ×0.2
   * "doubt / late test / assess" → ×0.7
   * "back in training / available / returned / fit" → floor to 0.9
4. Clamp to `[0, 0.99]`.

# Captaincy scoring (v1)

Ranks XI players for captaincy. Top 3 shown in the Insights carousel.

```
score = start_prob × (10 / 2^(FDR-1))   # exponential FDR penalty
      + 4 if home                         # home advantage
      + form × 2                          # rolling last-3-GW average
      + ict_index / 10                    # attacking threat signal
```

FDR penalty is exponential: FDR 1 → ÷1, FDR 2 → ÷2, FDR 3 → ÷4, FDR 4 → ÷8, FDR 5 → ÷16.

# Built beyond MVP

* **Live points** — real-time GW scoring via `/my-team/{id}` (requires bearer token)
* **Pitch view** — SVG football pitch with symmetric player positioning and bench strip
* **Captaincy recommendations** — scored carousel slide (see formula above)
* **League rankings** — overall rank, GW rank, classic/H2H league positions
* **Hot news feed** — recent injury and transfer news, prioritised by recency and type
* **PL standings** — live Premier League table (football-data.org or stub fallback)
* **Settings & preferences** — theme, layout, default view, persisted to localStorage
* **Token management** — set bearer token at runtime via admin endpoint
* **Cache visibility** — status indicators (hit / stale / refreshing) in the top nav

# "Definition of done"

* Load by entry ID → see **XI + bench** with names, price, start%, fixture (FDR). ✅
* One **warning** if any XI player < 0.60 start%. ✅
* Player detail sheet opens with news + next 3 fixtures. ✅
* README has **setup, screenshots, and why it helps you**. ✅ *(screenshots TBD)*
