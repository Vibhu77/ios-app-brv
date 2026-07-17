# Brevo CRM & Analytics — iPhone App (PRD)

## Original Problem Statement
"Check Brevo app and all the APIs and do a simple iPhone app with the reporting of all
campaigns and also capability to see a contact and to edit and create a contact. Use API of Brevo."
Follow-up: replace API-key auth with **Brevo OAuth 2.0** login (mandatory login at startup, no API key).

## User Choices
- Design: Clean & minimal (light).
- Auth: **Brevo OAuth 2.0** (authorization code flow). No API key. Login mandatory at startup.
- Features: campaign reporting + view/edit/create contacts. Individual contacts only.

## Architecture
- **Frontend:** React Native + Expo (SDK 54), expo-router, bottom tabs. Login gated at root + tab layout.
  - Auth: BrevoContext holds an opaque **session token** (secure storage). Login opens the backend
    OAuth start URL via expo-web-browser `openAuthSessionAsync`, receives the session token back via
    deep link (`frontend://oauth-complete?token=...`) or web route `/oauth-complete`.
  - All /api calls send `Authorization: Bearer <sessionToken>`.
  - Keyboard: react-native-keyboard-controller. Tokens in /app/frontend/src/theme.ts.
- **Backend:** FastAPI + Motor/MongoDB. Confidential OAuth client (holds client_secret server-side).
  - Auth routes: GET /api/auth/brevo/login (302 → Brevo authorize), GET /api/auth/brevo/callback
    (code→token exchange, creates session doc, 302 back to app with token), GET /api/auth/me,
    POST /api/auth/logout.
  - Sessions stored in Mongo (`sessions`): access_token, refresh_token, expires_at (epoch), account.
    Access token auto-refreshed via refresh_token when expired (`get_session` dependency).
  - Brevo data routes /api/brevo/* proxy to https://api.brevo.com/v3 with `Authorization: Bearer <accessToken>`.
- **Env (backend/.env):** BREVO_CLIENT_ID, BREVO_CLIENT_SECRET, BREVO_REDIRECT_URI, BREVO_SCOPES.
  - Scopes: account:read campaigns.email:read contacts:read contacts:write.
  - Redirect URI (preview): https://<preview-host>/api/auth/brevo/callback

## User Personas
- Marketer / small-business owner managing Brevo campaigns + contacts from an iPhone.

## Implemented
- 2026-07-15 (v1): API-key MVP — Settings key entry, Campaigns + detail, Contacts + detail,
  Create/Edit contact, backend Brevo proxy. (Superseded by OAuth.)
- 2026-07-17 (v2): **Brevo OAuth 2.0** login replaces API key. Login screen, mandatory auth gate,
  backend OAuth start/callback + session store + auto-refresh, session-protected data routes,
  Settings shows connected account + Sign out. Verified: 401 gates, login-not-configured 500,
  unauth deep-route redirects to /login, login UI renders.

## Backlog / Remaining
- P0: User must supply BREVO_CLIENT_ID / BREVO_CLIENT_SECRET and register the redirect URI + scopes
  in their Brevo OAuth app to enable real login (currently placeholders → login returns 500).
- P1: Live smoke test of OAuth round-trip + data flows (needs credentials, best on Expo Go / build).
- P1: Handle mid-session 401 in data screens by redirecting to /login.
- P1: Contacts pagination / infinite scroll (loads first 100).
- P2: Campaign trend charts; add production redirect URI to Brevo app after deploy.

## Next Tasks
1. Add Brevo OAuth credentials to backend/.env; register redirect URI + scopes in Brevo.
2. Smoke-test login + campaigns/contacts CRUD.
