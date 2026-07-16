# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WhatsApp AI chatbot + admin dashboard for "The Ohm Gym", built as a single Next.js (App Router) app deployed to Vercel. The webhook receives WhatsApp Cloud API events, drives a structured menu flow (with an LLM fallback for free-form questions) via an NVIDIA-hosted LLM (OpenAI-compatible Chat Completions API), and logs everything to Supabase (Postgres); the `/admin` dashboard is a password-protected internal tool for gym staff to view/onboard members. ES modules throughout (`"type": "module"` in package.json).

## Commands

- `npm run dev` — Next.js dev server.
- `npm run build` / `npm start` — production build / start.
- `npm run create-admin` — interactive CLI (`scripts/create-admin.mjs`) that provisions or updates an admin dashboard login. This is the **only** way to create an admin account — there is no public signup route, by design.
- `node scripts/seed-plans.mjs` — idempotent seed script for the four gym membership plans (Without/With Cardio × 1/3 Month) into the `plans` table. Safe to re-run; skips plans that already exist by name.
- `node scripts/nvidia-probe.mjs` — diagnostic script that probes multiple NVIDIA API endpoint URL variants to find which one the account's API key/model actually works against. Useful when the LLM call starts returning 404s.

There are no automated tests or linter configured.

## Architecture

Everything lives under `app/` (Next.js App Router). Two independent surfaces share the same Supabase client and `utils/`:

1. **WhatsApp webhook** — `app/api/webhook/route.js` (GET for Meta verification, POST for message processing).
2. **Admin dashboard** — `app/admin/*` pages, gated by `proxy.js` + `app/api/admin/*` auth routes (see below).

### WhatsApp webhook

[app/api/webhook/route.js](app/api/webhook/route.js) handles both:

- **GET**: Meta's webhook verification handshake (`hub.mode`/`hub.verify_token`/`hub.challenge`).
- **POST**: incoming WhatsApp messages. Always responds `200 EVENT_RECEIVED` at the end — Meta retries aggressively on non-200, and on Vercel responding early can freeze the process and swallow the rest of the handler's async work, so processing happens fully before the ack, wrapped in try/catch.

Per-message flow in the POST handler:

1. **Dedup** — check `message_logs.wa_message_id` before processing (Meta redelivers webhooks).
2. **User lookup/creation** — match `users.phone_number`; auto-create as `role: 'member'`, `name: 'Guest'` if unseen. Phone numbers are stored exactly as Meta sends them in `message.from` (digits only, country code, no `+`) — anything written elsewhere (e.g. admin onboarding) must match that format.
3. **Conversation management** — reuse the user's most recent `status: 'active'` conversation (bump `last_activity_at`) or create a new one. This grouping exists so LLM context retrieval doesn't require slow timestamp-range queries across all messages. The conversation's `context` JSONB column (`{ "awaiting": ... }`) tracks which structured menu, if any, the user is mid-flow in.
4. **Structured menu flow, with LLM fallback** — see below.
5. **Log both sides** as two rows in `message_logs` (inbound + outbound) in one insert.

#### Menu flow vs. free-form AI chat

The bot is a hybrid: a rule-based menu system layered on top of the original free-form AI assistant, not a replacement for it.

- A brand-new conversation, or any message matching `MENU_TRIGGER_WORDS` (`hi`/`hello`/`hey`/`menu`/`start`), sends the main menu as a WhatsApp **interactive list message** (`sendWhatsAppList` in [utils/whatsapp.js](utils/whatsapp.js)) and sets `conversation.context = { awaiting: "main_menu" }`.
- While `awaiting: "main_menu"`, the next reply is resolved either from the tapped list row's `id` or a typed fallback number 1–10 (`resolveMainMenuSelection` in [utils/gymMenu.js](utils/gymMenu.js)), then answered from canned/DB-backed content (`buildMainMenuReply`). Selecting "Existing Member Support" (option 10) opens a second-level 5-option list and sets `awaiting: "support_menu"`.
- Any message received while `context.awaiting` is null/absent is idle — it falls through to the original free-form LLM assistant (`getGymAssistantResponse` in [utils/gemini.js](utils/gemini.js)).
- **Grounding is mandatory for the free-form path**: the idle branch feeds `buildKnownFactsText()` (all canned menu content — plans, timings, location, contact, payment methods, free trial, PT, diet — assembled in one place in [utils/gymMenu.js](utils/gymMenu.js)) into the LLM's context, and the system instruction explicitly forbids inventing specific facts (prices, phone numbers, addresses, payment methods) not present in that context. This was added after the model fabricated a nonexistent phone number and a nonexistent "pay on our website" option when asked free-form questions with no grounding — if you add a new canned content block, add it to `buildKnownFactsText()` too, or free-form questions about it will hallucinate.
- Menu copy lives in [utils/gymContent.js](utils/gymContent.js) (row definitions, canned text blocks) — hardcoded intentionally for now; a future iteration may move gym-specific facts (timings/location/contact) into a DB-backed settings table so gym staff can edit them without a code deploy.

### NVIDIA LLM integration quirks ([utils/gemini.js](utils/gemini.js))

- `NVIDIA_API_BASE` is normalized to accept a bare host, a `/v1` base, or a full `/v1/chat/completions` URL — don't assume the env var has one canonical shape.
- The system instruction is concatenated into the `user` message content rather than sent as a `role: "system"` message, because some NVIDIA-hosted models reject the system role.
- Request has an abort-controller timeout (`NVIDIA_TIMEOUT_MS`, default 12000ms).
- A 404 from the chat completions call almost always means `NVIDIA_MODEL` isn't enabled/visible for the API key — cross-check against `GET {base}/v1/models` (see README) or run `scripts/nvidia-probe.mjs`.

### Database ([schema.sql](schema.sql))

Schema is documented inline in the file with comment blocks per table — read those before modifying. Key design decisions to preserve:

- `subscriptions` is **append-only**: never update/overwrite a row to represent renewal or plan change — insert a new row. This is how membership history is reconstructed.
- `attendance_logs` (check-in only) and `workout_sessions` (what they did) are intentionally separate tables — a check-in doesn't imply a logged workout and vice versa.
- JSONB `metadata`/`features`/`session_data`/`raw_ai_parse`/`ai_metadata`/`context` columns are the extension point for new fields — prefer adding to these over new migrations for speculative/future fields, consistent with the existing schema comments.
- `broadcast_jobs` is the audit trail for the cron-driven proactive features described below; not yet wired to any running code.
- There is no migration tooling — schema changes are applied by hand via the Supabase SQL Editor and mirrored into `schema.sql`. `conversations.context` was added this way; if you add a column, do both.

### Not yet implemented (per README "Phase 3")

Morning broadcast check-ins, expiry alerts, inactivity nudges, birthday messages, and richer attendance-logic parsing are planned but not present in the codebase yet — don't assume cron/broadcast code exists just because `broadcast_jobs` and `trigger_type` columns are in the schema. These require a Vercel Cron config and are a larger, separate scope from the reactive webhook flow.

### Admin dashboard auth

- [proxy.js](proxy.js) (Next 16's `middleware.js` replacement) gates every `/admin/*` route except `/admin/login` — it verifies a signed session JWT cookie (`ohm_admin_session`) and redirects to login if missing/invalid. **When adding new `/admin/*` pages, double check the matcher in `proxy.js` covers the exact path** — it originally missed the bare `/admin` path (no trailing segment) because the regex required a trailing slash; the fix was adding `"/admin"` as its own matcher entry alongside `"/admin/((?!login).*)"`. The matcher does **not** cover `/api/admin/*` at all (login must stay reachable unauthenticated) — any new mutating admin API route must verify the session cookie itself (see `app/api/admin/members/route.js` for the pattern: `verifySessionToken`/`ADMIN_SESSION_COOKIE` from `utils/adminSession.js`).
- Sessions are signed/verified with `jose` in [utils/adminSession.js](utils/adminSession.js) (edge-compatible, used by proxy.js). Passwords are hashed with `bcryptjs` and only ever compared inside Node-runtime route handlers (`app/api/admin/login/route.js`), never in the proxy. `ADMIN_SESSION_SECRET` must be 32+ characters or `createSessionToken`/`verifySessionToken` throw — this bit us once as a "500 Internal Server Error" on login in production after the secret was missing from Vercel's env vars.
- Login has basic brute-force lockout (5 failed attempts → 15 min lock, tracked on the `admins` row) and returns a generic "Invalid username or password" for both wrong password and unknown username, including a dummy bcrypt compare on unknown usernames to avoid timing-based user enumeration.
- `app/admin/page.js` is a server component that reads live data on every request (`export const dynamic = "force-dynamic"` — without it, Next tries to statically prerender the page at build time and fails since it needs a live Supabase connection). It also renders `OnboardMemberForm` (client component), which posts to `app/api/admin/members/route.js` to upsert a `users` row by phone number and insert a matching `subscriptions` row — `end_date` is computed server-side from the selected plan's `duration_days`, never trust a client-supplied end date.
- Styling is a hand-rolled `app/globals.css` (no Tailwind/CSS framework) — card/table/form conventions (`.admin-shell`, `.field-input-row`, `.btn-primary`, `.badge-*`, etc.) are established there; reuse those classes for new admin UI rather than inline styles.

## Environment variables

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `NVIDIA_API_KEY`, `ADMIN_SESSION_SECRET` (random string, 32+ chars — signs admin dashboard session cookies).
Optional (have defaults): `NVIDIA_API_BASE`, `NVIDIA_MODEL`, `NVIDIA_TIMEOUT_MS`, `WHATSAPP_TIMEOUT_MS`.

These must be set identically in both `.env` (local) and Vercel's Project Settings → Environment Variables (production) — they are not shared automatically, and a mismatch (or a typo'd `SUPABASE_URL` host) is the most common cause of "works locally, fails in production."
