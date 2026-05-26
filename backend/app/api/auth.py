import base64
import hashlib
import re
import secrets
import uuid

import httpx
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel

from app.deps import limiter, verify_api_key

router = APIRouter(prefix="/api/auth", dependencies=[Depends(verify_api_key)])

_CLIENT_ID = "bfcbaf69-aade-4c1b-8f00-c1cb8a193030"
_REDIRECT_URI = "https://fantasy.premierleague.com/"
_STANDARD_CONNECTION_ID = "867ed4363b2bc21c860085ad2baa817d"

_URLS = {
    "auth": "https://account.premierleague.com/as/authorize",
    "start": "https://account.premierleague.com/davinci/policy/262ce4b01d19dd9d385d26bddb4297b6/start",
    "login": "https://account.premierleague.com/davinci/connections/{}/capabilities/customHTMLTemplate",
    "resume": "https://account.premierleague.com/as/resume",
    "token": "https://account.premierleague.com/as/token",
}

_UA = "Mozilla/5.0 (compatible; FPL-Helper/1.0)"


def _code_verifier() -> str:
    return secrets.token_urlsafe(64)[:128]


def _code_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip("=")


async def _pkce_login(email: str, password: str) -> tuple[str, str]:
    verifier = _code_verifier()
    challenge = _code_challenge(verifier)
    state = uuid.uuid4().hex

    async with httpx.AsyncClient(
        follow_redirects=False, timeout=20.0, headers={"User-Agent": _UA}
    ) as client:
        # Step 1: authorisation page — get accessToken + form state
        r = await client.get(
            _URLS["auth"],
            params={
                "client_id": _CLIENT_ID,
                "redirect_uri": _REDIRECT_URI,
                "response_type": "code",
                "scope": "openid profile email offline_access",
                "state": state,
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            },
        )
        html = r.text
        m_token = re.search(r'"accessToken":"([^"]+)"', html)
        m_state = re.search(r'<input[^>]+name="state"[^>]+value="([^"]+)"', html)
        if not m_token or not m_state:
            raise HTTPException(502, detail="Unexpected response from FPL auth page")
        access_token = m_token.group(1)
        form_state = m_state.group(1)

        bearer = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        # Step 2: start interaction
        r = await client.post(_URLS["start"], headers=bearer)
        body = r.json()
        interaction_id = body["interactionId"]

        # Step 3a: polling continue
        r = await client.post(
            _URLS["login"].format(_STANDARD_CONNECTION_ID),
            headers={"interactionId": interaction_id},
            json={
                "id": body["id"],
                "eventName": "continue",
                "parameters": {"eventType": "polling"},
                "pollProps": {
                    "status": "continue",
                    "delayInMs": 10,
                    "retriesAllowed": 1,
                    "pollChallengeStatus": False,
                },
            },
        )

        # Step 3b: submit credentials
        r = await client.post(
            _URLS["login"].format(_STANDARD_CONNECTION_ID),
            headers={"interactionId": interaction_id},
            json={
                "id": r.json()["id"],
                "nextEvent": {
                    "constructType": "skEvent",
                    "eventName": "continue",
                    "params": [],
                    "eventType": "post",
                    "postProcess": {},
                },
                "parameters": {
                    "buttonType": "form-submit",
                    "buttonValue": "SIGNON",
                    "username": email,
                    "password": password,
                },
                "eventName": "continue",
            },
        )
        cred_body = r.json()

        if cred_body.get("status") == "FAILED" or "connectionId" not in cred_body:
            raise HTTPException(401, detail="Invalid FPL credentials")

        # Step 3c: finalise with new connectionId
        r = await client.post(
            _URLS["login"].format(cred_body["connectionId"]),
            headers=bearer,
            json={
                "id": cred_body["id"],
                "nextEvent": {
                    "constructType": "skEvent",
                    "eventName": "continue",
                    "params": [],
                    "eventType": "post",
                    "postProcess": {},
                },
                "parameters": {"buttonType": "form-submit", "buttonValue": "SIGNON"},
                "eventName": "continue",
            },
        )
        dv_response = r.json().get("dvResponse")
        if not dv_response:
            raise HTTPException(401, detail="Invalid FPL credentials")

        # Step 4: resume OAuth flow
        r = await client.post(
            _URLS["resume"],
            data={"dvResponse": dv_response, "state": form_state},
        )
        location = r.headers.get("location", "")
        m_code = re.search(r"[?&]code=([^&]+)", location)
        if not m_code:
            raise HTTPException(502, detail="FPL auth redirect did not contain a code")
        auth_code = m_code.group(1)

        # Step 5: exchange code for tokens
        r = await client.post(
            _URLS["token"],
            data={
                "grant_type": "authorization_code",
                "redirect_uri": _REDIRECT_URI,
                "code": auth_code,
                "code_verifier": verifier,
                "client_id": _CLIENT_ID,
            },
        )
        tokens = r.json()
        if "access_token" not in tokens:
            raise HTTPException(502, detail="FPL token exchange failed")

        return tokens["access_token"], tokens["refresh_token"]


async def _pkce_refresh(refresh_token: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": _UA}) as client:
        r = await client.post(
            _URLS["token"],
            data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": _CLIENT_ID,
                "scope": "openid profile email offline_access",
            },
        )
        tokens = r.json()
        if "access_token" not in tokens:
            raise HTTPException(401, detail="refresh_expired")
        return tokens["access_token"], tokens["refresh_token"]


class LoginRequest(BaseModel):
    email: str
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, body: LoginRequest = Body(...)):
    access_token, refresh_token = await _pkce_login(body.email, body.password)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh(request: Request, body: RefreshRequest = Body(...)):
    access_token, refresh_token = await _pkce_refresh(body.refresh_token)
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)
