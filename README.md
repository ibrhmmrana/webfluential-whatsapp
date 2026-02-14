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
| `WHATSAPP_ALLOWED_AI_NUMBER` | Optional; digits only with country code (e.g. `27693475825`). Only this number receives AI replies; others get messages saved but no AI response. Default: `27693475825`. |
| **Supabase** | |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side writes (webhook, admin API). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Required for admin dashboard (auth + Realtime). |
| **AI** | |
| `OPENAI_API_KEY` | For the WhatsApp AI agent (e.g. gpt-4o-mini). |

**Production (e.g. Vercel):** Set the same variables in your host’s environment (e.g. Vercel → Project → Settings → Environment Variables). Admin auth uses Supabase Auth (email + password). Session is stored in cookies via @supabase/ssr. In Supabase Dashboard go to Authentication → Providers → Email and turn off "Enable Sign Up". Add admin users manually under Authentication → Users → Add user.

**Custom domain:** If you use both a Vercel URL (e.g. `webfluential-whatsapp.vercel.app`) and a custom domain (e.g. `webfluential.intakt.co.za`), cookies are per-origin. Always open and sign in on the **same** URL you use for the dashboard (e.g. only the custom domain, or only the Vercel URL). Otherwise the server won't receive auth cookies and you'll see "Not signed in".

## Database (Supabase)

Run the SQL in `supabase/migrations/001_whatsapp_tables.sql` to create:

- **chatbot_history** — every message (incoming + outgoing) for dashboard and AI context.
- **whatsapp_human_control** — which conversations are in human takeover (AI does not reply).

**Realtime (required for live updates in the dashboard):**

1. In Supabase Dashboard go to **Database → Replication**.
2. Find the **supabase_realtime** publication and click to edit.
3. Under "Tables", add **chatbot_history** (enable INSERT so new messages are broadcast).
4. Save. Without this, new messages will not appear in the UI until you refresh.
5. In production, set **NEXT_PUBLIC_SUPABASE_ANON_KEY** in Vercel (the dashboard uses it for auth and for the Realtime subscription).

---

## Production: Supabase checklist

If **conversations don’t load** or **live messages don’t appear** on production, check:

| Check | Why it matters |
|-------|----------------|
| **SUPABASE_SERVICE_ROLE_KEY** set in Vercel | The admin API uses this to read `chatbot_history`. If missing, the server returns "Supabase not configured" and you get no conversations. |
| **NEXT_PUBLIC_SUPABASE_URL** and **NEXT_PUBLIC_SUPABASE_ANON_KEY** set in Vercel | Required for auth and for the browser Realtime client. Redeploy after adding/changing these (they are inlined at build time). |
| **Replication:** `chatbot_history` in **supabase_realtime** publication | In Supabase Dashboard → Database → Replication → edit **supabase_realtime** → add table **chatbot_history** (INSERT). Otherwise Realtime won’t broadcast new rows and live messages won’t appear. |
| **Same Supabase project** for local and prod | Use the same project URL and keys in Vercel as in `.env.local` if you want to see the same data. |
| **No RLS on `chatbot_history`** (or policies that allow read) | The app does not use RLS by default. If you enable RLS, add policies so the service role (and, for Realtime, the anon/authenticated role) can read `chatbot_history`. |

## Scripts

- `npm run dev` — start dev server
- `npm run build` — build for production
- `npm run start` — start production server

## Routes

- `GET/POST /api/whatsapp/webhook` — Meta webhook (verify + receive messages).
- `/` — Admin home (login if not authenticated).
- `/whatsapp` — WhatsApp conversations, take over / handover to AI, send messages.

Redirects: `/dashboard-admin` → `/`, `/dashboard-admin/communications/whatsapp` → `/whatsapp` (for old links).
