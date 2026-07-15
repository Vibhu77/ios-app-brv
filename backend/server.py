from fastapi import FastAPI, APIRouter, Header, HTTPException, Request
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path
from typing import Optional
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

BREVO_BASE = "https://api.brevo.com/v3"

app = FastAPI()
api_router = APIRouter(prefix="/api")


async def brevo(method: str, path: str, api_key: str, params: dict | None = None, json_body: dict | None = None):
    if not api_key:
        raise HTTPException(status_code=401, detail={"message": "Missing Brevo API key. Add it in Settings."})
    headers = {
        "api-key": api_key,
        "accept": "application/json",
        "content-type": "application/json",
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.request(method, f"{BREVO_BASE}{path}", headers=headers, params=params, json=json_body)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail={"message": f"Could not reach Brevo: {e}"})

    if resp.status_code >= 400:
        try:
            body = resp.json()
        except Exception:
            body = {"message": resp.text or "Brevo request failed"}
        # Normalize Brevo error to a message
        message = body.get("message") if isinstance(body, dict) else str(body)
        raise HTTPException(status_code=resp.status_code, detail={"message": message or "Brevo request failed", "raw": body})

    if resp.status_code == 204 or not resp.content:
        return {}
    return resp.json()


@api_router.get("/")
async def root():
    return {"message": "Brevo CRM & Analytics API"}


@api_router.get("/brevo/account")
async def get_account(x_brevo_key: Optional[str] = Header(None)):
    return await brevo("GET", "/account", x_brevo_key)


@api_router.get("/brevo/campaigns")
async def list_campaigns(x_brevo_key: Optional[str] = Header(None), limit: int = 100, offset: int = 0):
    # statistics=globalStats returns aggregated stats per campaign
    return await brevo("GET", "/emailCampaigns", x_brevo_key, params={
        "limit": limit,
        "offset": offset,
        "statistics": "globalStats",
        "sort": "desc",
    })


@api_router.get("/brevo/campaigns/{campaign_id}")
async def get_campaign(campaign_id: int, x_brevo_key: Optional[str] = Header(None)):
    return await brevo("GET", f"/emailCampaigns/{campaign_id}", x_brevo_key, params={"statistics": "globalStats"})


@api_router.get("/brevo/contacts")
async def list_contacts(x_brevo_key: Optional[str] = Header(None), limit: int = 100, offset: int = 0):
    return await brevo("GET", "/contacts", x_brevo_key, params={"limit": limit, "offset": offset, "sort": "desc"})


@api_router.get("/brevo/attributes")
async def get_attributes(x_brevo_key: Optional[str] = Header(None)):
    return await brevo("GET", "/contacts/attributes", x_brevo_key)


@api_router.get("/brevo/contacts/{identifier}/stats")
async def contact_stats(identifier: str, x_brevo_key: Optional[str] = Header(None)):
    return await brevo("GET", f"/contacts/{identifier}/campaignStats", x_brevo_key)


@api_router.get("/brevo/contacts/{identifier}")
async def get_contact(identifier: str, x_brevo_key: Optional[str] = Header(None)):
    return await brevo("GET", f"/contacts/{identifier}", x_brevo_key)


@api_router.post("/brevo/contacts")
async def create_contact(request: Request, x_brevo_key: Optional[str] = Header(None)):
    body = await request.json()
    return await brevo("POST", "/contacts", x_brevo_key, json_body=body)


@api_router.put("/brevo/contacts/{identifier}")
async def update_contact(identifier: str, request: Request, x_brevo_key: Optional[str] = Header(None)):
    body = await request.json()
    return await brevo("PUT", f"/contacts/{identifier}", x_brevo_key, json_body=body)


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)
