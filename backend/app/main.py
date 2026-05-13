# main.py
from __future__ import annotations

from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
ENV_PATH = BASE_DIR / ".env"

load_dotenv(dotenv_path=ENV_PATH)

import asyncio
import os as _os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.deps import limiter
from app.services.service import FPLService
from app.api.api import health_router, router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.svc = FPLService()

    async def _prewarm():
        try:
            await app.state.svc.bootstrap()
        except Exception:
            pass

    asyncio.create_task(_prewarm())

    try:
        yield
    finally:
        await app.state.svc.close()


app = FastAPI(
    title="FPL Helper API",
    version="0.2.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — lock to specific origins in production via ALLOWED_ORIGINS env var
# (comma-separated, e.g. "https://my-app.vercel.app,https://www.my-app.com")
# Unset or empty → allow all origins (local dev only)
_raw_origins = _os.getenv("ALLOWED_ORIGINS", "")
_allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-cache-status", "x-cache-age"],
)

app.include_router(health_router)
app.include_router(api_router)
