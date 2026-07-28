from fastapi import FastAPI, APIRouter, Header, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import time
import secrets
import logging
import urllib.parse
from pathlib import Path
from typing import Optional
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger("brevo_proxy")

# --- Brevo OAuth config ---
BREVO_API_BASE = "https://api.brevo.com/v3"
BREVO_AUTHORIZE_URL = "https://oauth.brevo.com/realms/partner/oauth/authorize"
BREVO_TOKEN_URL = "https://oauth.brevo.com/realms/partner/oauth/token"

CLIENT_ID = os.environ.get("BREVO_CLIENT_ID", "")
CLIENT_SECRET = os.environ.get("BREVO_CLIENT_SECRET", "")
REDIRECT_URI = os.environ.get("BREVO_REDIRECT_URI", "")
SCOPES = os.environ.get("BREVO_SCOPES", "account:read campaigns.email:read contacts:read contacts:write")

# --- Mongo ---
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI()
api_router = APIRouter(prefix="/api")


# ---------------- Brevo API helper (Bearer OAuth token) ----------------
async def brevo(method: str, path: str, access_token: str, params: dict | None = None, json_body: dict | None = None):
    headers = {
        "Authorization": f"Bearer {access_token}",
        "accept": "application/json",
        "content-type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            resp = await c.request(method, f"{BREVO_API_BASE}{path}", headers=headers, params=params, json=json_body)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail={"message": f"Could not reach Brevo: {e}"})

    if resp.status_code >= 400:
        raw_text = resp.text or ""
        try:
            body = resp.json()
        except Exception:
            body = None
        if isinstance(body, dict):
            message = body.get("message") or body.get("error") or raw_text or "Brevo request failed"
            brevo_code = body.get("code")
        else:
            message = raw_text or "Brevo request failed"
            brevo_code = None
        logger.warning(
            "Brevo API error: %s %s%s -> HTTP %s | code=%s | body=%s",
            method, BREVO_API_BASE, path, resp.status_code, brevo_code, raw_text[:2000],
        )
        raise HTTPException(
            status_code=resp.status_code,
            detail={
                "message": message,
                "upstream_status": resp.status_code,
                "brevo_code": brevo_code,
                "upstream_body": body if body is not None else raw_text[:2000],
            },
        )

    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


# Brevo returns HTTP 500 for limit>=~100 on some endpoints (e.g. /emailCampaigns),
# so we page at 50 and concatenate. Resilient: skip an individual page that 5xxs
# and keep the rest instead of blanking the screen. Client errors (4xx like auth)
# are propagated so real failures still surface.
async def brevo_paginated(
    path: str,
    access_token: str,
    list_key: str,
    page_size: int = 50,
    max_pages: int = 60,
    extra_params: dict | None = None,
):
    items: list = []
    offset = 0
    total: int | None = None
    pages = 0
    consecutive_failures = 0
    while pages < max_pages:
        params = {"limit": page_size, "offset": offset}
        if extra_params:
            params.update(extra_params)
        try:
            data = await brevo("GET", path, access_token, params=params)
            consecutive_failures = 0
        except HTTPException as e:
            if e.status_code < 500:
                raise
            logger.warning("Paginated fetch skipping %s offset=%s: %s", path, offset, getattr(e, "detail", e))
            consecutive_failures += 1
            if consecutive_failures >= 2:
                break
            offset += page_size
            pages += 1
            continue

        if total is None:
            total = data.get("count")
        page_items = data.get(list_key) or []
        items.extend(page_items)
        offset += page_size
        pages += 1

        if len(page_items) < page_size:
            break
        if total is not None and offset >= total:
            break

    return {"count": total if total is not None else len(items), list_key: items}




# ---------------- Session / token management ----------------
def _bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    return authorization.split(" ", 1)[1].strip()


async def _refresh_session(sess: dict) -> Optional[dict]:
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                BREVO_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "refresh_token": sess["refresh_token"],
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
        if r.status_code >= 400:
            logger.warning("Brevo token refresh failed: HTTP %s | body=%s", r.status_code, (r.text or "")[:1000])
            return None
        t = r.json()
    except httpx.RequestError:
        return None

    update = {
        "access_token": t["access_token"],
        "refresh_token": t.get("refresh_token", sess["refresh_token"]),
        "expires_at": time.time() + t.get("expires_in", 3600),
    }
    if t.get("scope"):
        update["granted_scopes"] = t["scope"]
    await db.sessions.update_one({"_id": sess["_id"]}, {"$set": update})
    sess.update(update)
    return sess


async def get_session(authorization: Optional[str] = Header(None)) -> dict:
    token = _bearer(authorization)
    if not token:
        raise HTTPException(status_code=401, detail={"message": "Not authenticated"})
    sess = await db.sessions.find_one({"session_token": token})
    if not sess:
        raise HTTPException(status_code=401, detail={"message": "Session expired. Please sign in again."})
    if sess.get("expires_at", 0) <= time.time() + 30:
        refreshed = await _refresh_session(sess)
        if not refreshed:
            raise HTTPException(status_code=401, detail={"message": "Session expired. Please sign in again."})
        sess = refreshed
    return sess


# ---------------- Auth (OAuth) endpoints ----------------
@api_router.get("/")
async def root():
    return {"message": "Brevo CRM & Analytics API", "oauth_configured": bool(CLIENT_ID and CLIENT_SECRET)}


@api_router.get("/auth/brevo/login")
async def brevo_login(redirect: str):
    if not (CLIENT_ID and CLIENT_SECRET and REDIRECT_URI):
        raise HTTPException(status_code=500, detail={"message": "OAuth is not configured on the server."})
    state = secrets.token_urlsafe(24)
    await db.oauth_states.insert_one({"state": state, "redirect": redirect, "created_at": time.time()})
    params = {
        "response_type": "code",
        "client_id": CLIENT_ID,
        "redirect_uri": REDIRECT_URI,
        "scope": SCOPES,
        "state": state,
    }
    url = f"{BREVO_AUTHORIZE_URL}?{urllib.parse.urlencode(params, quote_via=urllib.parse.quote)}"
    return RedirectResponse(url)


@api_router.get("/auth/brevo/callback")
async def brevo_callback(
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
):
    st = await db.oauth_states.find_one({"state": state}) if state else None
    redirect = st["redirect"] if st else ""
    if state:
        await db.oauth_states.delete_one({"state": state})

    def back_with_error(msg: str):
        if redirect:
            sep = "&" if "?" in redirect else "?"
            return RedirectResponse(f"{redirect}{sep}error={urllib.parse.quote(msg)}")
        raise HTTPException(status_code=400, detail={"message": msg})

    if error:
        return back_with_error(error_description or error)
    if not code or not st:
        return back_with_error("Invalid authorization response")

    # Exchange code for tokens
    try:
        async with httpx.AsyncClient(timeout=30.0) as c:
            r = await c.post(
                BREVO_TOKEN_URL,
                data={
                    "grant_type": "authorization_code",
                    "client_id": CLIENT_ID,
                    "client_secret": CLIENT_SECRET,
                    "code": code,
                    "redirect_uri": REDIRECT_URI,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError as e:
        return back_with_error(f"Could not reach Brevo: {e}")

    if r.status_code >= 400:
        logger.warning("Brevo token exchange failed: HTTP %s | body=%s", r.status_code, (r.text or "")[:2000])
        return back_with_error("Token exchange failed")
    tok = r.json()
    access_token = tok["access_token"]
    refresh_token = tok.get("refresh_token", "")
    expires_at = time.time() + tok.get("expires_in", 3600)
    granted_scopes = tok.get("scope", "")
    logger.info("Brevo OAuth granted scopes: %s", granted_scopes)

    # Fetch account for display
    account = {}
    try:
        account = await brevo("GET", "/account", access_token)
    except HTTPException:
        account = {}

    session_token = secrets.token_urlsafe(32)
    await db.sessions.insert_one({
        "session_token": session_token,
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_at": expires_at,
        "granted_scopes": granted_scopes,
        "account": {
            "email": account.get("email"),
            "firstName": account.get("firstName"),
            "lastName": account.get("lastName"),
            "companyName": account.get("companyName"),
        },
        "created_at": time.time(),
    })

    sep = "&" if "?" in redirect else "?"
    return RedirectResponse(f"{redirect}{sep}token={urllib.parse.quote(session_token)}")


@api_router.get("/auth/me")
async def auth_me(sess: dict = Depends(get_session)):
    return {
        "account": sess.get("account", {}),
        "granted_scopes": sess.get("granted_scopes", ""),
    }


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    token = _bearer(authorization)
    if token:
        await db.sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------- Brevo data endpoints (session-protected) ----------------
@api_router.get("/brevo/campaigns")
async def list_campaigns(sess: dict = Depends(get_session)):
    return await brevo_paginated(
        "/emailCampaigns", sess["access_token"], "campaigns",
        extra_params={"statistics": "globalStats", "sort": "desc", "excludeHtmlContent": "true"},
    )


@api_router.get("/brevo/campaigns/{campaign_id}")
async def get_campaign(campaign_id: int, sess: dict = Depends(get_session)):
    return await brevo("GET", f"/emailCampaigns/{campaign_id}", sess["access_token"], params={"statistics": "globalStats"})


@api_router.get("/brevo/contacts")
async def list_contacts(sess: dict = Depends(get_session)):
    return await brevo_paginated(
        "/contacts", sess["access_token"], "contacts",
        extra_params={"sort": "desc"},
    )


@api_router.get("/brevo/attributes")
async def get_attributes(sess: dict = Depends(get_session)):
    return await brevo("GET", "/contacts/attributes", sess["access_token"])


@api_router.get("/brevo/contacts/{identifier}/stats")
async def contact_stats(identifier: str, sess: dict = Depends(get_session)):
    return await brevo("GET", f"/contacts/{identifier}/campaignStats", sess["access_token"])


@api_router.get("/brevo/contacts/{identifier}")
async def get_contact(identifier: str, sess: dict = Depends(get_session)):
    return await brevo("GET", f"/contacts/{identifier}", sess["access_token"])


@api_router.post("/brevo/contacts")
async def create_contact(request: Request, sess: dict = Depends(get_session)):
    body = await request.json()
    return await brevo("POST", "/contacts", sess["access_token"], json_body=body)


@api_router.put("/brevo/contacts/{identifier}")
async def update_contact(identifier: str, request: Request, sess: dict = Depends(get_session)):
    body = await request.json()
    return await brevo("PUT", f"/contacts/{identifier}", sess["access_token"], json_body=body)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

