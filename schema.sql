-- ============================================================
-- USERS
-- role: 'member' | 'trainer' | 'admin'
-- status: 'active' | 'inactive' | 'suspended' | 'deleted'
-- metadata JSONB: future-proof field for things like
--   { "date_of_birth": "...", "emergency_contact": "...", "preferred_language": "hi" }
-- ============================================================
CREATE TABLE users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number    TEXT NOT NULL UNIQUE,
  name            TEXT,
  role            TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member', 'trainer', 'admin')),
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended', 'deleted')),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone    ON users (phone_number);
CREATE INDEX idx_users_status   ON users (status);
CREATE INDEX idx_users_metadata ON users USING GIN (metadata);


-- ============================================================
-- PLANS
-- A first-class entity. If you change plan pricing, old subscriptions
-- still reference the plan they were on. is_active=false retires a plan
-- without deleting historical data.
-- features JSONB: { "guest_passes": 2, "classes_included": true }
-- ============================================================
CREATE TABLE plans (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT NOT NULL,
  duration_days  INTEGER NOT NULL,   -- 30, 90, 365
  price          NUMERIC(10,2) NOT NULL,
  billing_cycle  TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_cycle IN ('monthly', 'quarterly', 'annual', 'one_time')),
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  features       JSONB DEFAULT '{}',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ============================================================
-- SUBSCRIPTIONS
-- Append-only lifecycle tracking — never overwrite, always insert.
-- status: 'active' | 'expired' | 'cancelled' | 'paused' | 'grace_period'
-- payment_ref: Razorpay/Stripe transaction ID for reconciliation
-- Edge case covered: a user can have multiple overlapping plans
--   (e.g. a trainer who also has a personal member plan)
-- ============================================================
CREATE TABLE subscriptions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id       UUID NOT NULL REFERENCES plans(id),
  start_date    TIMESTAMPTZ NOT NULL,
  end_date      TIMESTAMPTZ NOT NULL,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'paused', 'grace_period')),
  amount_paid   NUMERIC(10,2),
  payment_ref   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT no_end_before_start CHECK (end_date > start_date)
);

CREATE INDEX idx_subs_user_id   ON subscriptions (user_id);
CREATE INDEX idx_subs_end_date  ON subscriptions (end_date);   -- cron job performance
CREATE INDEX idx_subs_status    ON subscriptions (status);


-- ============================================================
-- ATTENDANCE_LOGS
-- Tracks physical check-in only — not what they did.
-- check_in_method: 'qr_code' | 'manual' | 'ai_confirmed' | 'staff'
-- subscription_id: which active plan validated this entry —
--   critical for debugging "member says they checked in but can't access" issues
-- session_data JSONB: { "station": "weights_floor", "entry_gate": "main" }
-- ============================================================
CREATE TABLE attendance_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_id   UUID REFERENCES subscriptions(id),
  check_in_time     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_in_method   TEXT NOT NULL DEFAULT 'ai_confirmed',
  session_data      JSONB DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_att_user_id       ON attendance_logs (user_id);
CREATE INDEX idx_att_check_in_time ON attendance_logs (check_in_time DESC);


-- ============================================================
-- WORKOUT_SESSIONS
-- Separate from attendance — a member might check in but do a
-- consultation, not a workout. Or log a workout without a check-in
-- (e.g. they tell the bot about yesterday's session).
-- source: 'ai_parsed' | 'manual' | 'wearable'
-- raw_ai_parse: store Gemini's raw response for debugging bad parses
-- intensity_score: 1-10, parsed from phrases like "really destroyed my chest"
-- ============================================================
CREATE TABLE workout_sessions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_log_id   UUID REFERENCES attendance_logs(id),  -- nullable: not all sessions have a check-in
  muscle_groups       TEXT[] NOT NULL DEFAULT '{}',         -- ['chest', 'triceps'] — native Postgres array
  duration_minutes    INTEGER,
  intensity_score     INTEGER CHECK (intensity_score BETWEEN 1 AND 10),
  notes               TEXT,
  source              TEXT NOT NULL DEFAULT 'ai_parsed',
  raw_ai_parse        JSONB DEFAULT '{}',
  logged_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workout_user_id      ON workout_sessions (user_id);
CREATE INDEX idx_workout_logged_at    ON workout_sessions (logged_at DESC);
CREATE INDEX idx_workout_muscle_grps  ON workout_sessions USING GIN (muscle_groups);  -- query by muscle group


-- ============================================================
-- CONVERSATIONS
-- Groups messages into sessions for Gemini context retrieval.
-- Without this, reconstructing context = slow timestamp range queries.
-- trigger_type: 'morning_checkin' | 'expiry_alert' | 'user_initiated' | 'broadcast_reply'
-- status: 'active' | 'closed' | 'pending_ai'
-- context JSONB: tracks which structured WhatsApp menu the user is mid-flow
--   in, e.g. { "awaiting": "main_menu" } or { "awaiting": "support_menu" }.
--   Null/empty means the conversation is idle and falls through to the LLM.
-- ============================================================
CREATE TABLE conversations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status           TEXT NOT NULL DEFAULT 'active',
  trigger_type     TEXT NOT NULL DEFAULT 'user_initiated',
  context          JSONB DEFAULT '{}',
  started_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_conv_user_id          ON conversations (user_id);
CREATE INDEX idx_conv_last_activity    ON conversations (last_activity_at DESC);


-- ============================================================
-- MESSAGE_LOGS
-- direction: 'inbound' (user → bot) | 'outbound' (bot → user)
-- wa_message_id: Meta's message ID — enables deduplication on webhook retries
-- ai_intent: what Gemini classified this message as —
--   'log_workout' | 'ask_question' | 'membership_query' | 'chit_chat'
-- ai_metadata: { "confidence": 0.92, "tokens_used": 340, "model": "gemini-1.5-flash" }
-- ============================================================
CREATE TABLE message_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content          TEXT NOT NULL,
  wa_message_id    TEXT UNIQUE,           -- deduplication key
  ai_intent        TEXT,
  ai_metadata      JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msg_conversation_id ON message_logs (conversation_id);
CREATE INDEX idx_msg_user_id         ON message_logs (user_id);
CREATE INDEX idx_msg_created_at      ON message_logs (created_at DESC);
CREATE INDEX idx_msg_wa_message_id   ON message_logs (wa_message_id);


-- ============================================================
-- BROADCAST_JOBS
-- Audit trail for every cron job execution.
-- filters JSONB: { "expiring_in_days": 3, "plan_type": "monthly" }
-- results JSONB: { "failed_numbers": ["+91..."], "error_codes": {...} }
-- ============================================================
CREATE TABLE broadcast_jobs (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type       TEXT NOT NULL,    -- 'morning_checkin' | 'expiry_alert_3d' | 'expiry_alert_1d'
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  target_count   INTEGER DEFAULT 0,
  sent_count     INTEGER DEFAULT 0,
  failed_count   INTEGER DEFAULT 0,
  filters        JSONB DEFAULT '{}',
  results        JSONB DEFAULT '{}',
  scheduled_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at   TIMESTAMPTZ
);


-- ============================================================
-- REMINDERS_SENT
-- Idempotency ledger for the proactive expiry-reminder cron
-- (app/api/cron/expiry-check). One row per (subscription, reminder_type)
-- that has been delivered. The UNIQUE constraint is the real double-send
-- guard — it survives cron retries and overlapping runs, so the send loop
-- can rely on an insert failing rather than a read-then-write race.
-- Kept separate from `subscriptions` so that table stays append-only and
-- is never mutated to record a side-channel like "reminder sent".
-- reminder_type: 'expiry_3d' | 'expiry_1d' | 'expired'
-- ============================================================
CREATE TABLE reminders_sent (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  reminder_type   TEXT NOT NULL CHECK (reminder_type IN ('expiry_3d', 'expiry_1d', 'expired')),
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscription_id, reminder_type)
);

CREATE INDEX idx_reminders_subscription ON reminders_sent (subscription_id);


-- ============================================================
-- ADMINS
-- Dashboard login accounts — never created via a public API route.
-- Provisioned only through scripts/create-admin.mjs.
-- failed_attempts/locked_until: basic brute-force lockout, reset on
-- successful login.
-- ============================================================
CREATE TABLE admins (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username         TEXT NOT NULL UNIQUE,
  password_hash    TEXT NOT NULL,
  failed_attempts  INTEGER NOT NULL DEFAULT 0,
  locked_until     TIMESTAMPTZ,
  last_login_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admins_username ON admins (username);


-- ============================================================
-- HELPER: auto-update updated_at on users
-- ============================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
