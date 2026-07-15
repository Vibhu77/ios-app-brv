# Brevo CRM & Analytics — iPhone App (PRD)

## Original Problem Statement
"Check Brevo app and all the APIs and do a simple iPhone app with the reporting of all
campaigns and also capability to see a contact and to edit and create a contact. Use API of Brevo."

## User Choices
- Design: Clean & minimal (light).
- Brevo API key: entered in an in-app Settings screen, stored securely on device.
- Features: campaign reporting + view/edit/create contacts.
- Scope: individual contacts only (no lists/segments).

## Architecture
- **Frontend:** React Native + Expo (SDK 54), expo-router file-based routing, bottom tabs.
  - Tabs: Campaigns, Contacts, Settings. Stack screens: campaign/[id], contact/[id], contact/form (modal).
  - State: BrevoContext holds the API key (secure storage) + validated account.
  - Keyboard: react-native-keyboard-controller (KeyboardAwareScrollView + KeyboardStickyView).
  - Design tokens in /app/frontend/src/theme.ts from /app/design_guidelines.json.
- **Backend:** FastAPI thin proxy to https://api.brevo.com/v3. App sends `X-Brevo-Key` header;
  backend forwards as `api-key`. httpx async client. Error normalization to JSON detail.message.
  Routes: /api/brevo/{account, campaigns, campaigns/{id}, contacts, contacts/{id},
  contacts (POST), contacts/{id} (PUT), contacts/{id}/stats, attributes}.
- No app login; the only credential is the user's Brevo API key.

## User Personas
- Marketer / small-business owner who runs Brevo email campaigns and manages a contact base
  on the go from their iPhone.

## Implemented (2026-07-15)
- Settings: API key entry + validation (calls /account), status banner, disconnect, secure storage.
- Campaigns: aggregate KPI scorecards (Total Sent, Campaigns, Avg Open/Click rate) + campaign
  cards with mini stats; pull-to-refresh; loading/empty/error states.
- Campaign Detail: hero open-rate metric + performance & deliverability stat rows with bars.
- Contacts: searchable list (client-side filter), initials avatars, FAB to add, states.
- Contact Detail: profile, 90-day activity (received/opened/clicked), info + attributes, Edit CTA.
- Contact Form: create/edit with dynamic Brevo attributes (text/float/date/boolean), email validation.
- Backend proxy verified (19/19 pytest). Frontend navigation + states verified.

## Backlog / Remaining
- P1: Real-key smoke test of live data flows (needs user's Brevo key).
- P1: Contacts pagination / infinite scroll (currently loads first 100).
- P2: Server-side contact search across full base; filter by email status.
- P2: Campaign filter chips (sent / draft / all) as a horizontal scroller.
- P2: Charts (open/click over time) using victory-native or gifted-charts.

## Next Tasks
1. User adds their Brevo API key in Settings, then smoke-test campaigns + contacts CRUD.
2. Add pagination to contacts list.
