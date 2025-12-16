# main.py
from __future__ import annotations

from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent   # backend/
ENV_PATH = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.services.service import FPLService
from app.api.api import router as api_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.svc = FPLService()

    # optional: prewarm some cache keys in the background
    async def _prewarm():
        try:
            await app.state.svc.bootstrap()
            # If you know the next/current GW, you could also prewarm fixtures here.
        except Exception:
            # swallow errors so startup isn't blocked
            pass

    asyncio.create_task(_prewarm())

    # hand control to FastAPI
    try:
        yield
    finally:
        # shutdown
        await app.state.svc.close()


app = FastAPI(
    title="FPL Helper API",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS (tune origins for prod)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # set your frontend origin in prod
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-cache-status", "x-cache-age"],
)

app.include_router(api_router)
