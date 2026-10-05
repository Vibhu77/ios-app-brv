from fastapi import FastAPI, APIRouter, Header, HTTPException, Request, Depends
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import time
import secrets
import asyncio
import logging
import urllib.parse
import hashlib
import base64
import hmac
import ipaddress
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
SCOPES = os.environ.get("BREVO_SCOPES", "account:read campaigns.email:read campaigns.email:write contacts:read contacts:write")

# --- OAuth redirect allow-list (anti open-redirect / token-leak) ---
# Only these forms of `redirect` are accepted by /auth/brevo/login. The value is
# parsed with urllib.parse (never substring-matched) and each URL component is
# checked. Allowed:
#   1. frontend://oauth-complete            (standalone app scheme, app.json)
#   2. https://<preview-host>/oauth-complete (Expo web preview)
#   3. exp:// or exps:// .../--/oauth-complete, ONLY when the host is localhost
#      or a private LAN IP (Expo Go during development)
APP_SCHEME = "frontend"
REDIRECT_PATH = "oauth-complete"
WEB_REDIRECT_HOSTS = {"brevo-ios-dashboard.preview.emergentagent.com"}
OAUTH_STATE_TTL = 600  # seconds — states older than this are rejected
OAUTH_CODE_TTL = 60    # seconds — one-time exchange codes expire fast


def _host_is_local_or_private(host: str) -> bool:
    if not host:
        return False
    if host in ("localhost", "127.0.0.1", "::1"):
        return True
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback


def _redirect_allowed(redirect: str, request_host: str | None) -> bool:
    try:
        u = urllib.parse.urlparse(redirect)
    except Exception:
        return False
    scheme = (u.scheme or "").lower()
    # 1) Standalone app custom scheme: frontend://oauth-complete
    if scheme == APP_SCHEME:
        combined = f"{u.netloc}{u.path}".strip("/")
        return combined == REDIRECT_PATH and not u.query and not u.fragment
    # 2) Web preview over HTTPS. Accept the configured preview host and (to stay
    #    fork-proof, since the app is served from the same origin as this API)
    #    the current request's own host.
    if scheme == "https":
        hosts = set(WEB_REDIRECT_HOSTS)
        if request_host:
            hosts.add(request_host.split(":")[0].lower())
        return (u.hostname in hosts) and (u.path.rstrip("/") == f"/{REDIRECT_PATH}")
    # 3) Expo Go dev deep link: exp(s)://<host>/--/oauth-complete
    #    Accept localhost / private-LAN hosts (classic `expo start`) AND the
    #    known Emergent preview/tunnel host(s) that Expo Go uses here. We never
    #    accept arbitrary exp:// hosts.
    if scheme in ("exp", "exps"):
        if u.path.rstrip("/").endswith(f"/--/{REDIRECT_PATH}"):
            host = u.hostname or ""
            if _host_is_local_or_private(host):
                return True
            allowed = set(WEB_REDIRECT_HOSTS)
            if request_host:
                allowed.add(request_host.split(":")[0].lower())
            return host in allowed
        return False
    return False


def _b64url_sha256(value: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(value.encode("ascii")).digest()).rstrip(b"=").decode("ascii")

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
                "sib_request_id": resp.headers.get("sib-request-id"),
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
    sess: dict,
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
            data = await brevo_authed("GET", path, sess, params=params)
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


# Per-session refresh locks (single-process FastAPI). Guards against concurrent
# refreshes clobbering each other during Brevo refresh-token rotation.
_refresh_locks: dict[str, asyncio.Lock] = {}
_refresh_locks_guard = asyncio.Lock()


async def _lock_for(session_token: str) -> asyncio.Lock:
    async with _refresh_locks_guard:
        lock = _refresh_locks.get(session_token)
        if lock is None:
            lock = asyncio.Lock()
            _refresh_locks[session_token] = lock
        return lock


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
        # Persist rotated refresh_token if Brevo returned a new one.
        "refresh_token": t.get("refresh_token", sess["refresh_token"]),
        "expires_at": time.time() + t.get("expires_in", 3600),
    }
    if t.get("scope"):
        update["granted_scopes"] = t["scope"]
    await db.sessions.update_one({"_id": sess["_id"]}, {"$set": update})
    sess.update(update)
    return sess


# Race-safe refresh: only one coroutine refreshes per session. After acquiring
# the lock we re-read the session; if another coroutine already refreshed (the
# access token changed vs. the stale one we started with) we skip and reuse it.
async def refresh_session_if_needed(sess: dict, stale_access_token: Optional[str] = None) -> Optional[dict]:
    lock = await _lock_for(sess["session_token"])
    async with lock:
        current = await db.sessions.find_one({"_id": sess["_id"]})
        if not current:
            return None
        if stale_access_token and current.get("access_token") != stale_access_token:
            sess.update(current)
            return sess
        return await _refresh_session(current)


# Proxy a Brevo call for a session. On an upstream 401 (expired/revoked access
# token or clock skew) refresh the token ONCE under the per-session lock and
# retry the upstream call exactly once. Never loops.
async def brevo_authed(
    method: str, path: str, sess: dict, params: dict | None = None, json_body: dict | None = None
):
    try:
        return await brevo(method, path, sess["access_token"], params=params, json_body=json_body)
    except HTTPException as e:
        if e.status_code != 401:
            raise
        logger.info("Relayed Brevo 401 on %s %s — refreshing access token and retrying once", method, path)
        refreshed = await refresh_session_if_needed(sess, sess["access_token"])
        if not refreshed:
            logger.info("Token refresh failed after Brevo 401 — forcing re-login")
            raise HTTPException(status_code=401, detail={"message": "Session expired. Please sign in again."})
        return await brevo(method, path, refreshed["access_token"], params=params, json_body=json_body)


async def get_session(authorization: Optional[str] = Header(None)) -> dict:
    token = _bearer(authorization)
    if not token:
        logger.info("Session-check 401: no bearer token on request")
        raise HTTPException(status_code=401, detail={"message": "Not authenticated"})
    sess = await db.sessions.find_one({"session_token": token})
    if not sess:
        logger.info("Session-check 401: unknown session token")
        raise HTTPException(status_code=401, detail={"message": "Session expired. Please sign in again."})
    if sess.get("expires_at", 0) <= time.time() + 30:
        refreshed = await refresh_session_if_needed(sess, sess.get("access_token"))
        if not refreshed:
            logger.info("Session-check 401: proactive token refresh failed")
            raise HTTPException(status_code=401, detail={"message": "Session expired. Please sign in again."})
        sess = refreshed
    return sess


# ---------------- Auth (OAuth) endpoints ----------------
@api_router.get("/")
async def root():
    return {"message": "Brevo CRM & Analytics API", "oauth_configured": bool(CLIENT_ID and CLIENT_SECRET)}


@api_router.get("/auth/brevo/login")
async def brevo_login(request: Request, redirect: str, code_challenge: str):
    if not (CLIENT_ID and CLIENT_SECRET and REDIRECT_URI):
        raise HTTPException(status_code=500, detail={"message": "OAuth is not configured on the server."})
    # Reject any redirect that isn't an exact, allow-listed app destination.
    if not _redirect_allowed(redirect, request.headers.get("host")):
        logger.warning("Rejected OAuth login: disallowed redirect=%r", redirect)
        raise HTTPException(status_code=400, detail={"message": "Invalid redirect."})
    # PKCE S256 challenge: base64url(sha256(verifier)), 43-128 chars.
    cc = code_challenge or ""
    if not (43 <= len(cc) <= 128) or not all(c.isalnum() or c in "-_" for c in cc):
        raise HTTPException(status_code=400, detail={"message": "Invalid code challenge."})
    state = secrets.token_urlsafe(24)
    await db.oauth_states.insert_one(
        {"state": state, "redirect": redirect, "code_challenge": cc, "created_at": time.time()}
    )
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
    # Atomically consume the state (prevents replay) and enforce freshness.
    st = await db.oauth_states.find_one_and_delete({"state": state}) if state else None
    redirect = st["redirect"] if st else ""
    if st and (time.time() - st.get("created_at", 0) > OAUTH_STATE_TTL):
        st = None  # expired: treat as invalid, but still bounce back via the (validated) redirect

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

    # Instead of leaking the session token in the redirect URL, issue a
    # single-use, short-lived (60s) code bound to this login's PKCE challenge.
    # The app POSTs {code, code_verifier} to /auth/exchange to get the token.
    one_time_code = secrets.token_urlsafe(32)
    await db.oauth_codes.insert_one({
        "code_hash": hashlib.sha256(one_time_code.encode("ascii")).hexdigest(),
        "code_challenge": st.get("code_challenge", ""),
        "session_token": session_token,
        "created_at": time.time(),
    })

    sep = "&" if "?" in redirect else "?"
    return RedirectResponse(f"{redirect}{sep}code={urllib.parse.quote(one_time_code)}")


@api_router.post("/auth/exchange")
async def auth_exchange(request: Request):
    # One-time code -> session token, gated by PKCE. The code is consumed
    # atomically so it can never be redeemed twice.
    body = await request.json()
    code = (body or {}).get("code") or ""
    verifier = (body or {}).get("code_verifier") or ""
    if not code or not verifier:
        raise HTTPException(status_code=400, detail={"message": "Missing code or verifier."})
    grant = await db.oauth_codes.find_one_and_delete(
        {"code_hash": hashlib.sha256(code.encode("ascii")).hexdigest()}
    )
    if not grant:
        raise HTTPException(status_code=400, detail={"message": "Invalid or expired code."})
    if time.time() - grant.get("created_at", 0) > OAUTH_CODE_TTL:
        raise HTTPException(status_code=400, detail={"message": "Code expired. Please sign in again."})
    expected = _b64url_sha256(verifier)
    if not hmac.compare_digest(expected, grant.get("code_challenge", "")):
        raise HTTPException(status_code=400, detail={"message": "PKCE verification failed."})
    return {"token": grant["session_token"]}


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
async def list_campaigns(sess: dict = Depends(get_session), page_size: int = 50):
    return await brevo_paginated(
        "/emailCampaigns", sess, "campaigns",
        page_size=max(1, min(page_size, 50)),
        extra_params={"statistics": "globalStats", "sort": "desc", "excludeHtmlContent": "true"},
    )


@api_router.get("/brevo/campaigns/{campaign_id}")
async def get_campaign(campaign_id: int, sess: dict = Depends(get_session)):
    return await brevo_authed("GET", f"/emailCampaigns/{campaign_id}", sess, params={"statistics": "globalStats"})


@api_router.put("/brevo/campaigns/{campaign_id}/status")
async def update_campaign_status(campaign_id: int, request: Request, sess: dict = Depends(get_session)):
    # Update a campaign's status (e.g. "suspended" to pause, "queued" to resume).
    # Proxies to Brevo PUT /emailCampaigns/{id}/status (returns 204). Real Brevo
    # 4xx (400 invalid transition, 403 insufficient_scope, 404 not found) pass
    # through via brevo(); brevo_authed adds transparent token-refresh on 401.
    body = await request.json()
    await brevo_authed("PUT", f"/emailCampaigns/{campaign_id}/status", sess, json_body=body)
    return {"ok": True, "status": body.get("status")}


@api_router.get("/brevo/contacts")
async def list_contacts(
    sess: dict = Depends(get_session),
    limit: int = 20,
    offset: int = 0,
):
    # Single-page fetch for fast initial load + infinite scroll. The client
    # drives pagination (offset += limit) and stops when a page returns fewer
    # than `limit` items.
    # NOTE: Brevo's /v3/contacts 500s at high limits for some accounts; we cap
    # at the user-selectable page size, max 50 (the confirmed 500 is at ~100).
    # If a page fails we surface the error (keeping Brevo's status + details)
    # rather than returning an empty page, which made the header show 0.
    limit = max(1, min(limit, 50))
    params = {"limit": limit, "offset": max(0, offset), "sort": "desc"}
    data = await brevo_authed("GET", "/contacts", sess, params=params)
    return {"count": data.get("count"), "contacts": data.get("contacts") or []}


@api_router.get("/brevo/attributes")
async def get_attributes(sess: dict = Depends(get_session)):
    return await brevo_authed("GET", "/contacts/attributes", sess)


# Full account fetch (GET /v3/account) for the Settings screen + pull-to-refresh.
# Returns the raw upstream payload (includes plan + planVerticals).
@api_router.get("/brevo/account")
async def get_brevo_account(sess: dict = Depends(get_session)):
    return await brevo_authed("GET", "/account", sess)

@api_router.get("/brevo/contacts/{identifier}/stats")
async def contact_stats(identifier: str, sess: dict = Depends(get_session)):
    return await brevo_authed("GET", f"/contacts/{identifier}/campaignStats", sess)


@api_router.get("/brevo/contacts/{identifier}")
async def get_contact(
    identifier: str,
    sess: dict = Depends(get_session),
    identifierType: Optional[str] = None,
):
    # URL-encode the identifier (emails/phones with "+" or "@") and forward the
    # optional identifierType (e.g. "phone_id") so Brevo can look up by phone.
    encoded = urllib.parse.quote(identifier, safe="")
    params = {"identifierType": identifierType} if identifierType else None
    return await brevo_authed("GET", f"/contacts/{encoded}", sess, params=params)


# Contact payload handling (create/update). ext_id is a TOP-LEVEL sibling of
# attributes — never put it inside attributes (Brevo would make it a custom
# attribute instead of the external ID).
ALLOWED_ATTRIBUTES = {"FIRSTNAME", "LASTNAME", "SMS", "WHATSAPP", "LANDLINE_NUMBER"}


def _clean_phone(v: str) -> str:
    # SMS / LANDLINE_NUMBER: trim, keep a single leading "+" if present.
    return v.strip()


def _build_contact_payload(raw: dict, is_create: bool):
    errors: list = []
    attrs_in = raw.get("attributes") or {}
    attrs: dict = {}
    # On UPDATE an explicitly-provided empty string clears the attribute in
    # Brevo; on CREATE we simply omit empties. A key absent from attrs_in is
    # left untouched.
    for k in ("FIRSTNAME", "LASTNAME"):
        if k not in attrs_in or not isinstance(attrs_in.get(k), str):
            continue
        v = attrs_in[k]
        if v.strip():
            attrs[k] = v.strip()
        elif not is_create:
            attrs[k] = ""
    for k in ("SMS", "LANDLINE_NUMBER"):
        if k not in attrs_in or not isinstance(attrs_in.get(k), str):
            continue
        v = attrs_in[k]
        if v.strip():
            cleaned = _clean_phone(v)
            digits = cleaned.lstrip("+")
            # The app already validates with libphonenumber-js and sends E.164.
            # Require "+" followed by 7–15 digits (E.164 length).
            if not (cleaned.startswith("+") and digits.isdigit() and 7 <= len(digits) <= 15):
                errors.append({"field": k, "message": f"{k} must be + followed by 7–15 digits (e.g. +4512345678)."})
            else:
                attrs[k] = cleaned
        elif not is_create:
            attrs[k] = ""
    if "WHATSAPP" in attrs_in and isinstance(attrs_in.get("WHATSAPP"), str):
        wa = attrs_in["WHATSAPP"]
        if wa.strip():
            digits = "".join(ch for ch in wa if ch.isdigit())
            # App sends digits only (no "+"); accept any valid E.164 length.
            if not (7 <= len(digits) <= 15):
                errors.append({"field": "WHATSAPP", "message": "WHATSAPP must be 7–15 digits (e.g. 4512345678)."})
            else:
                attrs["WHATSAPP"] = digits
        elif not is_create:
            attrs["WHATSAPP"] = ""

    payload: dict = {}
    email = raw.get("email")
    if isinstance(email, str) and email.strip():
        payload["email"] = email.strip()
    ext = raw.get("ext_id")
    if isinstance(ext, str):
        if ext.strip():
            payload["ext_id"] = ext.strip()  # top-level sibling of attributes
        elif not is_create:
            payload["ext_id"] = ""  # clear external ID on update
    if attrs:
        payload["attributes"] = attrs

    if is_create and not errors:
        # At least one identifier: email, SMS, WhatsApp, landline or ext_id —
        # same as Brevo web. Names alone cannot create a contact. Skipped when
        # a field failed validation so the specific error surfaces instead of
        # this generic one.
        if not (
            payload.get("email")
            or attrs.get("SMS")
            or attrs.get("WHATSAPP")
            or attrs.get("LANDLINE_NUMBER")
            or payload.get("ext_id")
        ):
            raise HTTPException(
                status_code=400,
                detail={"message": "Add an email, phone number (SMS, WhatsApp or landline) or external ID."},
            )
    return payload, errors


@api_router.post("/brevo/contacts")
async def create_contact(request: Request, sess: dict = Depends(get_session)):
    body = await request.json()
    payload, errors = _build_contact_payload(body, is_create=True)
    if errors:
        raise HTTPException(status_code=400, detail={"message": errors[0]["message"], "field": errors[0]["field"]})
    return await brevo_authed("POST", "/contacts", sess, json_body=payload)


@api_router.put("/brevo/contacts/{identifier}")
async def update_contact(identifier: str, request: Request, sess: dict = Depends(get_session)):
    body = await request.json()
    payload, errors = _build_contact_payload(body, is_create=False)
    if errors:
        raise HTTPException(status_code=400, detail={"message": errors[0]["message"], "field": errors[0]["field"]})
    encoded = urllib.parse.quote(identifier, safe="")
    return await brevo_authed("PUT", f"/contacts/{encoded}", sess, json_body=payload)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
async def _ensure_oauth_ttl_indexes():
    # Backstop cleanup of expired OAuth artifacts. Correctness never depends on
    # TTL timing — both the callback and /auth/exchange re-check expiry in-query.
    try:
        await db.oauth_states.create_index("created_at", expireAfterSeconds=OAUTH_STATE_TTL)
        await db.oauth_codes.create_index("created_at", expireAfterSeconds=OAUTH_CODE_TTL)
    except Exception as e:
        logger.warning("OAuth TTL index setup skipped: %s", e)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

