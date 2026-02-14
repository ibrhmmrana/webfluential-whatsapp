# Cursor Prompt: Replicate WhatsApp AI Agent + Dashboard (Foundation)


I have a Next.js App Router project with a WhatsApp webhook at `POST /api/whatsapp/webhook` that receives Meta payloads and currently replies with "Received". I need you to build the full foundation to match our reference architecture. **This is not for a merch store** — no quotes, invoices, or domain-specific features. Just the foundation so I can add my use case later.

---

### 1. Environment variables

Support these (document in README or .env.example):

- **Webhook:** `WHATSAPP_WEBHOOK_VERIFY_TOKEN` (for Meta GET verification)
- **WhatsApp Cloud API:** `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
- **Supabase:** `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), `SUPABASE_SERVICE_ROLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY` for dev)
- **Admin dashboard:** `ADMIN_DASH_PASSWORD`, `ADMIN_DASH_COOKIE_SECRET` (and optionally `ADMIN_DASH_COOKIE_NAME`, default e.g. `app_admin_auth`)
- **AI:** `OPENAI_API_KEY`
- **Session prefix (optional):** `WHATSAPP_SESSION_ID_PREFIX` (default `APP-`). Session IDs are `{PREFIX}{waId}` e.g. `APP-27987654321`.

---

### 2. Database (Supabase)

Create two tables (SQL or Supabase dashboard).

**Table: `chatbot_history`**

Stores every message (incoming and outgoing) for dashboard and for AI context.

- `id` — serial / auto-increment primary key (Supabase default)
- `session_id` — text, not null (e.g. `APP-27987654321`)
- `message` — jsonb, not null. Structure: `{ "type": "human" | "ai", "content": string, "additional_kwargs": {}, "response_metadata": {} }`. For AI messages you can add `tool_calls`, `invalid_tool_calls` if needed later.
- `customer` — jsonb, not null. Structure: `{ "number": string, "name"?: string }`
- `date_time` — timestamptz, not null (default `now()`)

Optional: `idx` integer if you want explicit ordering; otherwise order by `id` or `date_time`.

Enable **Supabase Realtime** for `chatbot_history` (INSERT) so the dashboard can show new messages without refresh.

**Table: `whatsapp_human_control`**

Stores which conversations are in “human takeover” mode (AI must not reply).

- `session_id` — text, primary key
- `is_human_controlled` — boolean, not null (true = human is replying, AI should not respond)
- `updated_at` — timestamptz (optional, for auditing)

Use **upsert** on `session_id` when setting human control.

---

### 3. Webhook (`/api/whatsapp/webhook`)

**GET (verification):**  
Read `hub.mode`, `hub.verify_token`, `hub.challenge` from query. If `hub.mode === 'subscribe'` and `hub.verify_token === process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN`, return the `hub.challenge` as plain text with status 200. Otherwise return 403.

**POST (incoming message):**  
- Parse the JSON body and support the same formats as our reference (direct array, standard Meta `object: 'whatsapp_business_account'` with `entry[].changes[].value`, and direct `contacts`/`messages` on body). Extract: sender phone `waId` (from `contacts[0].wa_id` or `messages[0].from`), optional `customerName` from `contacts[0].profile?.name`, and message text from `messages[0].text?.body`. Only process when `messages[0].type === 'text'`.
- Build `sessionId = (process.env.WHATSAPP_SESSION_ID_PREFIX || 'APP-') + waId` and `customerNumber = waId` (normalized, digits only).
- **Human control check:** Call `isHumanInControl(sessionId)` (read from `whatsapp_human_control` in Supabase). If **true:** save the incoming message to `chatbot_history` (type `human`, content = message text, customer = number + name), then return 200 with a short JSON like `{ status: 'ok', message: 'Human in control - AI skipped' }`. Do **not** call the AI or send any reply.
- If **false (AI in control):**  
  1. Save the incoming message to `chatbot_history` (same as above).  
  2. Call the AI agent: `processMessage(sessionId, messageText, customerNumber, customerName)`.  
  3. Send the AI’s text reply via the WhatsApp Cloud API (POST to `https://graph.facebook.com/v20.0/{WHATSAPP_PHONE_NUMBER_ID}/messages` with `messaging_product: 'whatsapp'`, `to`, `type: 'text'`, `text: { body }`).  
  4. Save the AI reply to `chatbot_history` (type `ai`, content = response text, same customer).  
  5. Return 200.  
- On any error, still return 200 so Meta doesn’t retry; log errors.

Implement shared helpers: **saveWhatsAppMessage(sessionId, messageType, content, customer, aiMetadata?)** (writes to `chatbot_history`), **isHumanInControl(sessionId)** and **setHumanControl(sessionId, isHumanControlled)** (read/upsert `whatsapp_human_control`), and **sendWhatsAppMessage(phoneNumber, message)** (WhatsApp Cloud API). Use a single Supabase client (service role) for server-side writes.

---

### 4. AI agent (generic foundation)

- **Input:** `sessionId`, `userMessage`, optional `customerPhone`, optional `customerName`.
- **Behaviour:**  
  - Load the last N (e.g. 20) messages for `session_id === sessionId` from `chatbot_history`, ordered by `date_time` or `id` ascending. Map `message.type === 'human'` to role `user`, `message.type === 'ai'` to role `assistant`; use `message.content` for content.  
  - Build OpenAI messages: one system message (short, generic: e.g. “You are a helpful WhatsApp assistant. Be concise and professional. If you don’t know something or the user asks for a human, say so.”), then the history, then the current `userMessage` as user.  
  - Call OpenAI (e.g. `gpt-4o-mini`) with `chat.completions.create`. No tools required for the foundation; you can add a single `escalate_to_human` tool later that just returns a fixed message or logs.  
  - Return an object like `{ content: string }` (the assistant reply text).
- **Persistence of turns:** The webhook already saves the user message and the AI reply to `chatbot_history`, so the next time the user writes, the history will include this turn. Do **not** duplicate-save inside the AI module; the webhook is the single writer for this flow.

Use a server-side Supabase client to read from `chatbot_history` for history. No separate Postgres or “n8n_chat_histories” table; one Supabase table is enough for both dashboard and AI context.

---

### 5. Admin dashboard – auth

- **Login:** A page (e.g. `/dashboard-admin` or `/admin`) that shows a password field. On submit, POST to `/api/admin/login` with `{ password }`. The API compares password to `ADMIN_DASH_PASSWORD`; if it matches, set an HTTP-only cookie with value = HMAC-SHA256(password, ADMIN_DASH_COOKIE_SECRET) (or similar), cookie name from `ADMIN_DASH_COOKIE_NAME`, path `/`, maxAge 30 days, httpOnly, sameSite lax, secure in production.
- **Protection:** A dashboard layout that reads the cookie and, if missing or invalid, shows the login form instead of children. All admin API routes (conversations, human-control, send-message) must check this cookie (same HMAC check) and return 401 if not authed. Use a shared `isAuthed(request)` and `noIndexHeaders()` (e.g. `X-Robots-Tag: noindex, nofollow`).

---

### 6. Admin dashboard – WhatsApp UI

- **Route:** e.g. `/dashboard-admin/communications/whatsapp` (or `/admin/whatsapp`). Page is a client component that implements the following.

**Data and API:**

- **Conversations list:** GET `/api/admin/whatsapp/conversations` → returns `{ conversations: Array<{ sessionId, customerName, customerNumber, lastMessageContent, lastMessageAt, messageCount, lastCustomerMessageId? }> }`. Implement this by reading from `chatbot_history`: group by `session_id`, for each group take latest row by `date_time`/`id` to get last message content and time, customer name/number from `customer` jsonb, and count. Sort by last message time descending. For “unread” you can use `lastCustomerMessageId` (id of latest human message) and store “viewed” message ids in localStorage; if the latest human message id is not in viewed set, show an unread indicator.
- **Messages for one conversation:** GET `/api/admin/whatsapp/conversations/[sessionId]` → returns `{ messages: Array<{ id, idx?, sessionId, senderType: 'human'|'ai', content, customerName, customerNumber, createdAt? }> }`. Read from `chatbot_history` where `session_id = sessionId`, order by `date_time` or `id` ascending, map rows to the message shape (parse `message` and `customer` jsonb).
- **Human control:** GET `/api/admin/whatsapp/human-control?sessionId=...` → `{ isHumanInControl: boolean }`. POST `/api/admin/whatsapp/human-control` body `{ sessionId, isHumanInControl: boolean }` → call `setHumanControl(sessionId, isHumanInControl)`.
- **Send message (human reply):** POST `/api/admin/whatsapp/send-message` body `{ message, customerName, customerNumber }`. Validate required fields. Send the text via WhatsApp Cloud API (same as webhook sender), then save to `chatbot_history` with type `ai` and the same customer so it appears as an “agent” message in the thread.

**UI behaviour:**

- **Left column:** Search (filter conversations by name, number, or last message text), list of conversations with customer name, last message preview, time, and unread dot when applicable. Click a row to select that conversation.
- **Right column:** When a conversation is selected, show a header with customer name and a “Search in messages” toggle. Message list: bubbles (human left, ai right), timestamps, date separators (Today, Yesterday, or date). Auto-scroll to bottom when messages load or new messages arrive. Optional: in-message search with next/previous and highlight.
- **Realtime:** Subscribe to Supabase Realtime `INSERT` on `chatbot_history`. On payload, if `session_id` matches the selected conversation, append the new message to local state (and mark as viewed if human). If it’s another conversation, refresh the conversations list and optionally mark that conversation unread.
- **Input bar (only when a conversation is selected):**  
  - If **AI in control:** Show a short label “AI in Control” and a **“Take over”** button. On click, set human control to true (POST human-control), update local state and optionally localStorage so the bar switches to the human input.  
  - If **Human in control:** Show a text input, a **“Handover to AI”** button, and a **Send** button. On Send: POST send-message, clear input; the new message will appear via Realtime. On “Handover to AI”, set human control to false and clear input.
- **Session ID prefix:** When building `sessionId` in send-message (for saving to `chatbot_history`), use the same prefix as the webhook: `(process.env.WHATSAPP_SESSION_ID_PREFIX || 'APP-') + customerNumber` so threads stay consistent.

You can omit the “Customer Activity” sidebar panel or add a stub panel that says “Customer activity will be available when you add your use case.” No need for quote/invoice or domain-specific APIs.

---

### 7. File structure (suggested)

- `src/app/api/whatsapp/webhook/route.ts` — GET (verify), POST (receive, human check, save, optional AI, send reply, save).
- `src/lib/whatsapp/sender.ts` — sendWhatsAppMessage(phoneNumber, message).
- `src/lib/whatsapp/messageStorage.ts` — saveWhatsAppMessage(sessionId, messageType, content, customer, aiMetadata?).
- `src/lib/whatsapp/humanControl.ts` — isHumanInControl(sessionId), setHumanControl(sessionId, isHumanControlled).
- `src/lib/whatsapp/aiAgent.ts` — processMessage(sessionId, userMessage, customerPhone?, customerName?) → get history from Supabase chatbot_history, call OpenAI, return { content }.
- `src/lib/chatHistories.ts` (or under whatsapp) — getConversations(), getConversationBySessionId(sessionId) using Supabase chatbot_history.
- `src/lib/supabaseAdmin.ts` — create Supabase client with service role key (server-only).
- `src/lib/adminAuth.ts` — cookie name, hashToken(password), isAuthed(req), noIndexHeaders().
- `src/app/api/admin/login/route.ts` — POST, validate password, set cookie.
- `src/app/api/admin/whatsapp/conversations/route.ts` — GET, auth, return conversations.
- `src/app/api/admin/whatsapp/conversations/[sessionId]/route.ts` — GET, auth, return messages.
- `src/app/api/admin/whatsapp/human-control/route.ts` — GET (query sessionId), POST (body sessionId, isHumanInControl).
- `src/app/api/admin/whatsapp/send-message/route.ts` — POST, auth, send via WhatsApp and save to chatbot_history.
- `src/app/dashboard-admin/layout.tsx` — check auth, show login form or DashboardLayoutClient with sidebar + children.
- `src/app/dashboard-admin/communications/whatsapp/page.tsx` — export a client component that implements the WhatsApp dashboard UI above.

Use `export const dynamic = 'force-dynamic'` and `export const runtime = 'nodejs'` on API routes. Session ID must be consistent everywhere: webhook, send-message, human-control, and conversation list/detail (all use the same prefix + phone number).

---

### 8. Summary

- **Webhook:** Verify (GET), receive (POST) → parse → human control? → save incoming → if AI: call AI → send reply → save reply.  
- **Storage:** One Supabase table for messages (`chatbot_history`), one for human takeover (`whatsapp_human_control`). AI reads history from `chatbot_history`; no separate memory DB.  
- **AI:** Generic system prompt, history from Supabase, OpenAI chat completion, return text only.  
- **Dashboard:** Auth by cookie, list conversations, open thread, realtime updates, “Take over” / “Handover to AI”, send message as human.  

Implement this foundation so I can later add my own use case (custom tools, prompts, and flows) on top.
