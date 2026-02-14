# Webfluential

WhatsApp AI agent + admin dashboard (Next.js App Router).

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Description |
|----------|-------------|
| **Webhook** | |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Secret for Meta webhook GET verification; must match Meta dashboard. |
| **WhatsApp Cloud API** | |
| `WHATSAPP_ACCESS_TOKEN` | Permanent access token from Meta Business. |
| `WHATSAPP_PHONE_NUMBER_ID` | Phone number ID from Meta (not the number itself). |
| `WHATSAPP_SESSION_ID_PREFIX` | Optional; default `APP-`. Session IDs = `{PREFIX}{waId}`. |
| **Supabase** | |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes (webhook, admin API). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side Realtime in admin dashboard (optional; enable Realtime in Supabase). |
| **Admin dashboard** | |
| `ADMIN_DASH_PASSWORD` | Password for `/dashboard-admin` login. |
| `ADMIN_DASH_COOKIE_SECRET` | Secret for signing the auth cookie. |
| `ADMIN_DASH_COOKIE_NAME` | Optional; default `app_admin_auth`. |
| **AI** | |
| `OPENAI_API_KEY` | For the WhatsApp AI agent (e.g. gpt-4o-mini). |

## Database (Supabase)

Run the SQL in `supabase/migrations/001_whatsapp_tables.sql` to create:

- **chatbot_history** — every message (incoming + outgoing) for dashboard and AI context.
- **whatsapp_human_control** — which conversations are in human takeover (AI does not reply).

Enable **Realtime** for `chatbot_history`: in Supabase Dashboard go to **Database → Replication**, add `chatbot_history` to the `supabase_realtime` publication so the admin dashboard gets new messages without refresh.

## Scripts

- `npm run dev` — start dev server
- `npm run build` — build for production
- `npm run start` — start production server

## Routes

- `GET/POST /api/whatsapp/webhook` — Meta webhook (verify + receive messages).
- `/dashboard-admin` — Admin home (login if not authenticated).
- `/dashboard-admin/communications/whatsapp` — WhatsApp conversations, take over / handover to AI, send messages.
