# The Ohm Gym Assistant 🏋️‍♂️🤖

A production-ready, AI-driven WhatsApp chatbot designed to act as a personal assistant for the members of 'The Ohm Gym'.

## 🚀 Overview

The Ohm Gym Assistant is a low-cost, high-performance solution that automates member engagement. It uses a state-of-the-art Generative AI model hosted on NVIDIA to interact with gym members, track their workouts, answer questions about the gym, and proactively manage membership lifecycle.

## 🛠 Tech Stack

- **Backend**: Node.js (Vercel Serverless Functions)
- **Database**: Supabase (PostgreSQL)
- **AI Engine**: NVIDIA-hosted LLM (OpenAI-compatible Chat Completions)
- **Messaging**: Meta WhatsApp Cloud API (Graph API via Webhooks)
- **Hosting**: Vercel

---

## 🏗 Database Architecture (Agile & Scalable)

We implemented a robust, future-proof schema consisting of 7 main entities:

1.  **Users**: Core member identity + JSONB metadata for future fields (injuries, goals, etc.).
2.  **Plans**: Standalone pricing and duration definitions.
3.  **Subscriptions**: Append-only lifestyle tracking to keep a history of renewals.
4.  **Attendance Logs**: Physical check-in tracking.
5.  **Workout Sessions**: AI-parsed activity tracking separate from attendance (e.g., "I hit chest yesterday").
6.  **Conversations**: Message grouping for fast LLM context retrieval.
7.  **Message Logs**: Full audit trail of every WhatsApp message with deduplication protection.

---

## ✅ Progress Tracking

### **Phase 1: Infrastructure & Foundation (100% Done)**

- [x] Supabase Database Schema Implementation.
- [x] Google AI Studio Project Setup.
- [x] Meta WhatsApp Developer App Configuration.
- [x] Vercel Production Project Initialization.

### **Phase 2: Core Chat Logic (100% Done)**

- [x] **Webhook Setup**: Automated verification with Meta.
- [x] **Deduplication**: Logic to prevent double-processing of messages.
- [x] **LLM Integration**: Context-aware AI responses (NVIDIA-hosted model).
- [x] **WhatsApp Delivery**: Utility to send outgoing messages to members.
- [x] **Auto-Member Creation**: Automatically registers new numbers as 'Guest' in the DB.

### **Phase 3: Proactive Services (In Progress)**

- [ ] **Morning Broadcasts**: Automated daily "How was your workout?" check-ins.
- [ ] **Expiry Alerts**: Automated reminders 3 days before membership expiration.
- [ ] **Attendance Logic**: Refining AI parsing to automatically update the `attendance_logs` table.

---

## ⚡ Deployment & Maintenance

Built for Vercel, the app is "Serverless." It costs $0 to run in testing mode and uses a Pay-as-you-go model for the WhatsApp API after the first 1,000 monthly conversations.

### Environment Variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WHATSAPP_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_VERIFY_TOKEN`

NVIDIA LLM:

- `NVIDIA_API_KEY`
- `NVIDIA_API_BASE` (default: `https://integrate.api.nvidia.com/v1`)
- `NVIDIA_MODEL` (example: `gemma-4-31b-it`)

**Repository**: `https://github.com/theomgym16-ai/ombot`
