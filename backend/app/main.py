# main.py
from __future__ import annotations

import asyncio
import os as _os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # backend/
load_dotenv(dotenv_path=BASE_DIR / ".env")
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.deps import limiter
from app.services.service import FPLService
from app.api.api import health_router, router as api_router
from app.api.auth import router as auth_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # startup
    app.state.svc = FPLService()

    async def _prewarm():
        try:
            await app.state.svc.bootstrap()
        except Exception:
            pass

    app.state.prewarm_task = asyncio.create_task(_prewarm())

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


@app.exception_handler(RequestValidationError)
async def _validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    # Return field/type errors without echoing submitted values (guards against
    # passwords appearing in error responses on malformed login requests).
    errors = [
        {"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()
    ]
    return JSONResponse(status_code=422, content={"detail": errors})


# CORS — lock to specific origins in production via ALLOWED_ORIGINS env var
# (comma-separated, e.g. "https://my-app.vercel.app,https://www.my-app.com")
# Unset or empty → allow all origins (local dev only)
_raw_origins = _os.getenv("ALLOWED_ORIGINS", "")
_allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

# allow_credentials=True is required for HttpOnly cookies on cross-origin requests.
# Wildcard origins are incompatible with credentials (browser spec); in dev the
# Vite proxy makes requests same-origin so this flag has no effect there.
_allow_credentials = _allow_origins != ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allow_origins,
    allow_credentials=_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["x-cache-status", "x-cache-age"],
)

app.include_router(health_router)
app.include_router(api_router)
app.include_router(auth_router)
