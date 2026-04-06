# FPL Helper

A Fantasy Premier League companion app that enriches your squad view with live data, fixture difficulty, availability heuristics, and captaincy recommendations.

## Features

- **Squad view** — XI + bench with player shirts, price, start probability, and next fixture (FDR colour-coded). Toggle between list and pitch layouts.
- **Live points** — Real-time GW points for your squad (requires FPL bearer token).
- **Captaincy picks** — Top 3 captain recommendations scored on start probability, fixture difficulty, form, and ICT index.
- **Team health** — Flags players under 60% start probability or carrying injuries.
- **Player detail** — Click any player to see availability, injury news, next 3 fixtures, and quick stats.
- **League rankings** — Your overall rank, GW rank, and position in classic/H2H leagues.
- **Hot news** — Recent injury and transfer news for your squad players.
- **PL standings** — Live Premier League table.
- **Dark / light / system theme** — Persisted per device.

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
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

### Configure

Create `backend/.env`:

```env
# Required
FPL_ENTRY_ID=your_entry_id

# Optional — needed for Live Points tab
FPL_BEARER_TOKEN=your_bearer_token

# Optional — needed for real PL standings (football-data.org)
FOOTBALL_DATA_API_KEY=your_key
```

**Finding your entry ID**: log in to the FPL website, go to the Points tab — the number in the URL (`/entry/XXXXXXX/`) is your entry ID.

**Getting your bearer token**: open browser DevTools → Network tab → reload the FPL site → find a request to `https://fantasy.premierleague.com/api/` → copy the `Authorization` header value.

### Run

```bash
# From the project root
npm run dev
```

This starts both the backend (port 8000) and frontend (port 5173) concurrently.

## Why it helps

The FPL website shows you your squad but gives you little to act on. FPL Helper puts start probability, fixture difficulty, form, and captaincy recommendations in one place so you can make decisions faster each gameweek.
