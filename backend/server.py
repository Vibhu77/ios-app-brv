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
        try:
            body = resp.json()
        except Exception:
            body = {"message": resp.text or "Brevo request failed"}
        message = body.get("message") if isinstance(body, dict) else str(body)
        raise HTTPException(status_code=resp.status_code, detail={"message": message or "Brevo request failed"})

    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


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
            return None
        t = r.json()
    except httpx.RequestError:
        return None

    update = {
        "access_token": t["access_token"],
        "refresh_token": t.get("refresh_token", sess["refresh_token"]),
        "expires_at": time.time() + t.get("expires_in", 3600),
    }
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
        return back_with_error("Token exchange failed")
    tok = r.json()
    access_token = tok["access_token"]
    refresh_token = tok.get("refresh_token", "")
    expires_at = time.time() + tok.get("expires_in", 3600)

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
    return {"account": sess.get("account", {})}


@api_router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    token = _bearer(authorization)
    if token:
        await db.sessions.delete_one({"session_token": token})
    return {"ok": True}


# ---------------- Brevo data endpoints (session-protected) ----------------
@api_router.get("/brevo/campaigns")
async def list_campaigns(sess: dict = Depends(get_session), limit: int = 100, offset: int = 0):
    return await brevo("GET", "/emailCampaigns", sess["access_token"], params={
        "limit": limit, "offset": offset, "statistics": "globalStats", "sort": "desc",
    })


@api_router.get("/brevo/campaigns/{campaign_id}")
async def get_campaign(campaign_id: int, sess: dict = Depends(get_session)):
    return await brevo("GET", f"/emailCampaigns/{campaign_id}", sess["access_token"], params={"statistics": "globalStats"})


@api_router.get("/brevo/contacts")
async def list_contacts(sess: dict = Depends(get_session), limit: int = 100, offset: int = 0):
    return await brevo("GET", "/contacts", sess["access_token"], params={"limit": limit, "offset": offset, "sort": "desc"})


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

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
