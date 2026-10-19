# FPL Helper

A Fantasy Premier League companion app that enriches your squad view with live data, fixture difficulty, availability heuristics, and captaincy recommendations.

## Features

- **Squad view** — XI + bench with player shirts, price, start probability, and next fixture (FDR colour-coded). Toggle between list and pitch layouts.
- **Live points** — Real-time GW points for your squad (log in via the Live tab).
- **Captaincy picks** — Top 3 captain recommendations plus a low-ownership differential pick. Scored on FPL expected points (ep_next), fixture difficulty, home advantage, DGW/BGW detection, positional weighting, and start probability. Hidden for historical GW views where data would be stale.
- **Transfer suggestions** — Affordable replacements for each position, scored on expected points, fixture difficulty, and start probability.
- **Team health** — Flags players under 60% start probability or carrying injuries.
- **Player detail** — Click any player for availability and injury news, transfer market activity, upcoming fixtures, position-ranked season stats, and past-season history.
- **Fixture ticker** — Difficulty heatmap for all 20 teams over the next 3–12 gameweeks, with blank and double gameweeks marked. Sort by average difficulty or any single gameweek.
- **Squad planner** — Draft a 15-player squad from the full player pool with live budget, position quota, and three-per-club checks. Saved in the browser.
- **Pre-season mode** — Before the GW1 deadline, shows a countdown in place of the squad, and the planner covers initial drafting.
- **League rankings** — Your overall rank, GW rank, and position in classic/H2H leagues.
- **Hot news** — Recent injury and transfer news for your squad players.
- **PL standings** — Live Premier League table.
- **International & European football** — Fixtures and lineups for Champions League, Europa League, Conference League, Nations League, and international/club friendlies. No API key required.
- **International duty** — Call-ups, withdrawals and recent country/club news for your squad players, plus whether each one featured in their country's most recent or next match.
- **Mobile layout** — Bottom tab bar, stacked panels, and touch-sized controls below 1024px.
- **Dark / light / system theme** — Persisted per device.
- **Privacy policy** — At `/privacy`, covering what data the app collects, the third-party services it uses, and your rights.
- **Cache status** — Live cache hit/miss/stale indicators and data age shown in the top nav.

## Stack

- **Backend**: Python · FastAPI · httpx · Pydantic · in-memory cache with stale-while-revalidate
- **Frontend**: React 19 · TypeScript · Vite · TanStack Router · Tailwind CSS 4

## Setup

### Prerequisites

- Python 3.10+
- Node.js 22.12+

### Install

```bash
git clone https://github.com/eoinhasty/fpl-helper.git
cd fpl-helper

# Backend
cd backend
python -m venv .venv
# Windows:
.venv\Scripts\activate
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Configure

Create `backend/.env` (copy from `backend/.env.example`):

```env
# Optional — server-side fallback bearer token, used only when a request
# arrives without a logged-in user's token (e.g. scripted access).
FPL_BEARER_TOKEN=

# Optional — enables the live Premier League standings widget.
# Leave empty to use stub data.
FOOTBALL_DATA_API_KEY=

# Optional — comma-separated allowed CORS origins.
# Leave empty for local development.
ALLOWED_ORIGINS=

# Optional — shared secret for X-Api-Key header guard.
# Must match VITE_API_SECRET in the frontend. Leave empty to disable the guard.
API_SECRET=
```

For a split deployment, create `frontend/.env` (copy from `frontend/.env.example`) and set `VITE_API_BASE_URL` to the backend's URL and `VITE_API_SECRET` to the backend's `API_SECRET`. Neither is needed locally, because the Vite dev proxy forwards `/api/*` to port 8000.

**Entry ID**: entered directly in the app — no env var needed. Log in to the FPL website, go to the Points tab — the number in the URL (`/entry/XXXXXXX/`) is your entry ID.

**Live points**: log in via the Live tab in the app using your FPL credentials. The app handles authentication via an OAuth PKCE flow.

### Run

```bash
cd frontend
npm run dev
```

This starts both the backend (port 8000) and frontend (port 5173) concurrently.

## Why it helps

The FPL website shows you your squad but gives you little to act on. FPL Helper puts start probability, fixture difficulty, form, and captaincy recommendations in one place so you can make decisions faster each gameweek.
