# MVP scope (what it does)

1. **Fetch next GW squad** (XI + bench, C/VC) from `/entry/{id}/event/{next_gw}/picks/`.
2. **Enrich with player info** from `/bootstrap-static/` (name, pos, team, price, status, news, total points, ICT).
3. **Show availability**: simple **start% heuristic** from `status` + `news` (and clamp injuries/suspensions to 0).
4. **Show fixture + difficulty** for each player from `/fixtures/?event={gw}` (opponent, H/A, FDR).
5. **One actionable hint**: alert if any XI player has **start% < 0.60** and suggest a higher-start% bench option.

# Minimal UI (three screens)

* **Squad (list)**: player cards → name, pos, price, start% bar, next fixture pill (with FDR).
* **Player detail** (sheet): availability, news, next 3 fixtures, quick stats.
* **Planner heatmap** (GW+3 or +4): your players × upcoming GWs with FDR shading.

# Endpoints you’ll call

* `GET /api/bootstrap-static/` → players, teams, events (find `is_next == true`)
* `GET /api/entry/{entry_id}/event/{gw}/picks/` → your squad
* `GET /api/fixtures/?event={gw}` → opponents, kickoff, **team\_\*\_difficulty**

# Recommended stack (pragmatic + fast)

**Backend (Python)**

* **FastAPI** + `httpx` (async calls)
* Pydantic models for responses
* Caching
* Cron Jobs to fetch data periodically

**Frontend**

* **React + Tailwind**
* Dark + light theme

# Fetching & caching etiquette

* **bootstrap-static**: cache 6–12h; refresh once more within 2–4h pre-deadline.
* **picks**: fetch on demand (when you open the app).
* **fixtures (gw)**: fetch when the GW changes (or on demand).
* Add a 500–1000 ms delay if it ever loops per-player endpoints (not required for MVP).

# Starter-likelihood heuristic (v0)

* Base by `status`: `a=0.88`, `d≈0.55`, `i/s/n=0`.
* Keyword tweaks on `news`:

  * contains “ruled out/surgery/setback” → ×0.2
  * “doubt/late test/assess” → ×0.7
  * “back in training/available/returned/fit” → floor to 0.9
* Clamp to `[0, 0.99]`.

# “Definition of done”

* Load by entry ID → see **XI + bench** with names, price, start%, fixture (FDR).
* One **warning** if any XI player < 0.60 start%.
* Player detail sheet opens with news + next 3 fixtures.
* README has **setup, screenshots, and why it helps you**.