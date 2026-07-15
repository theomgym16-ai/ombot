# CLAUDE.md check

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A WhatsApp AI chatbot + admin dashboard for "The Ohm Gym", built as a single Next.js (App Router) app deployed to Vercel. The webhook receives WhatsApp Cloud API events, calls an NVIDIA-hosted LLM (OpenAI-compatible Chat Completions API) for replies, and logs everything to Supabase (Postgres); the `/admin` dashboard is a password-protected internal tool for gym staff to view members. ES modules throughout (`"type": "module"` in package.json).

## Commands

- `npm run dev` — Next.js dev server.
- `npm run build` / `npm start` — production build / start.
- `npm run create-admin` — interactive CLI (`scripts/create-admin.mjs`) that provisions or updates an admin dashboard login. This is the **only** way to create an admin account — there is no public signup route, by design.
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
2. **User lookup/creation** — match `users.phone_number`; auto-create as `role: 'member'`, `name: 'Guest'` if unseen.
3. **Conversation management** — reuse the user's most recent `status: 'active'` conversation (bump `last_activity_at`) or create a new one. This grouping exists so LLM context retrieval doesn't require slow timestamp-range queries across all messages.
4. **LLM call** — [utils/gemini.js](utils/gemini.js)'s `getGymAssistantResponse(userMessage, contextText)` (despite the filename, this calls the NVIDIA-hosted model, not Gemini — historical naming holdover). On LLM failure, a fallback apology string is sent instead of throwing, so one bad LLM call never breaks message delivery.
5. **Send reply** via [utils/whatsapp.js](utils/whatsapp.js)'s `sendWhatsAppMessage`.
6. **Log both sides** as two rows in `message_logs` (inbound + outbound) in one insert.

### NVIDIA LLM integration quirks ([utils/gemini.js](utils/gemini.js))

- `NVIDIA_API_BASE` is normalized to accept a bare host, a `/v1` base, or a full `/v1/chat/completions` URL — don't assume the env var has one canonical shape.
- The system instruction is concatenated into the `user` message content rather than sent as a `role: "system"` message, because some NVIDIA-hosted models reject the system role.
- Request has an abort-controller timeout (`NVIDIA_TIMEOUT_MS`, default 12000ms).
- A 404 from the chat completions call almost always means `NVIDIA_MODEL` isn't enabled/visible for the API key — cross-check against `GET {base}/v1/models` (see README) or run `scripts/nvidia-probe.mjs`.

### Database ([schema.sql](schema.sql))

Schema is documented inline in the file with comment blocks per table — read those before modifying. Key design decisions to preserve:

- `subscriptions` is **append-only**: never update/overwrite a row to represent renewal or plan change — insert a new row. This is how membership history is reconstructed.
- `attendance_logs` (check-in only) and `workout_sessions` (what they did) are intentionally separate tables — a check-in doesn't imply a logged workout and vice versa.
- JSONB `metadata`/`features`/`session_data`/`raw_ai_parse`/`ai_metadata` columns are the extension point for new fields — prefer adding to these over new migrations for speculative/future fields, consistent with the existing schema comments.
- `broadcast_jobs` is the audit trail for the cron-driven proactive features described below; not yet wired to any running code.

### Not yet implemented (per README "Phase 3")

Morning broadcast check-ins, expiry alerts, and richer attendance-logic parsing are planned but not present in the codebase yet — don't assume cron/broadcast code exists just because `broadcast_jobs` and `trigger_type` columns are in the schema.

### Admin dashboard auth

- [proxy.js](proxy.js) (Next 16's `middleware.js` replacement) gates every `/admin/*` route except `/admin/login` — it verifies a signed session JWT cookie (`ohm_admin_session`) and redirects to login if missing/invalid. **When adding new `/admin/*` pages, double check the matcher in `proxy.js` covers the exact path** — it originally missed the bare `/admin` path (no trailing segment) because the regex required a trailing slash; the fix was adding `"/admin"` as its own matcher entry alongside `"/admin/((?!login).*)"`.
- Sessions are signed/verified with `jose` in [utils/adminSession.js](utils/adminSession.js) (edge-compatible, used by proxy.js). Passwords are hashed with `bcryptjs` and only ever compared inside Node-runtime route handlers (`app/api/admin/login/route.js`), never in the proxy.
- Login has basic brute-force lockout (5 failed attempts → 15 min lock, tracked on the `admins` row) and returns a generic "Invalid username or password" for both wrong password and unknown username, including a dummy bcrypt compare on unknown usernames to avoid timing-based user enumeration.
- `app/admin/page.js` is a server component that reads live data on every request (`export const dynamic = "force-dynamic"` — without it, Next tries to statically prerender the page at build time and fails since it needs a live Supabase connection).

## Environment variables

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `NVIDIA_API_KEY`, `ADMIN_SESSION_SECRET` (random string, 32+ chars — signs admin dashboard session cookies).
Optional (have defaults): `NVIDIA_API_BASE`, `NVIDIA_MODEL`, `NVIDIA_TIMEOUT_MS`, `WHATSAPP_TIMEOUT_MS`.
