# FPL Helper

A Fantasy Premier League companion app that enriches your squad view with live data, fixture difficulty, availability heuristics, and captaincy recommendations.

## Features

- **Squad view** — XI + bench with player shirts, price, start probability, and next fixture (FDR colour-coded). Toggle between list and pitch layouts.
- **Live points** — Real-time GW points for your squad (requires FPL bearer token, set via Settings).
- **Captaincy picks** — Top 3 captain recommendations scored on start probability, fixture difficulty, form, and ICT index.
- **Team health** — Flags players under 60% start probability or carrying injuries.
- **Player detail** — Click any player to see availability, injury news, next 3 fixtures, and quick stats.
- **League rankings** — Your overall rank, GW rank, and position in classic/H2H leagues.
- **Hot news** — Recent injury and transfer news for your squad players.
- **PL standings** — Live Premier League table.
- **Dark / light / system theme** — Persisted per device.
- **Cache status** — Live cache hit/miss/stale indicators and data age shown in the top nav.

## Stack

- **Backend**: Python · FastAPI · httpx · Pydantic · in-memory cache with stale-while-revalidate
- **Frontend**: React 19 · TypeScript · Vite · Tailwind CSS 4

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+

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
# Optional — server-side fallback bearer token for Live Points.
# Can also be set at runtime via the in-app Settings panel.
FPL_BEARER_TOKEN=

# Optional — enables the live Premier League standings widget.
# Leave empty to use stub data.
FOOTBALL_DATA_API_KEY=

# Optional — comma-separated allowed CORS origins.
# Leave empty for local development.
ALLOWED_ORIGINS=
```

**Entry ID**: entered directly in the app — no env var needed. Log in to the FPL website, go to the Points tab — the number in the URL (`/entry/XXXXXXX/`) is your entry ID.

**Bearer token**: set via the in-app Settings panel. To extract it, use the included `FPL X-Api-Authorization Sniffer` browser extension, or open DevTools → Network → reload the FPL site → find a request to `https://fantasy.premierleague.com/api/` → copy the `Authorization` header value.

### Run

```bash
# From the project root
npm run dev
```

This starts both the backend (port 8000) and frontend (port 5173) concurrently.

## Why it helps

The FPL website shows you your squad but gives you little to act on. FPL Helper puts start probability, fixture difficulty, form, and captaincy recommendations in one place so you can make decisions faster each gameweek.
