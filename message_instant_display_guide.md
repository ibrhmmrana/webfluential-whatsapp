# Guideline: Instant Display and Persistence of Chat Messages

This document describes how to make incoming messages (from the customer/user or from staff) appear almost instantly in the chat window and how to ensure every message is correctly persisted. Give this to the Cursor agent implementing the WhatsApp (or similar) chat dashboard.

---

## 1. Single source of truth: one table for all messages

- **One table** (e.g. `chatbot_history`) stores every message that should appear in the chat.
- **Every** message that appears in the UI must be written to this table first. There is no “display-only” path; persistence and display use the same data.

**Table shape (minimum):**

| Column       | Type      | Purpose |
|-------------|-----------|--------|
| `id`        | serial / bigint (PK) | Unique row id; used for deduplication and ordering. |
| `session_id`| text      | Conversation id (e.g. `APP-27987654321`). All messages in one thread share the same `session_id`. |
| `message`   | jsonb     | Payload. Must include: `type` (`'human'` or `'ai'`), `content` (string). Optional: `additional_kwargs`, `response_metadata`, `tool_calls`, etc. |
| `customer`  | jsonb     | At least `number` (string) and optionally `name` (string). Used for conversation list and message attribution. |
| `date_time` | timestamptz | When the message was created (default `now()`). Used for ordering and display. |

Optional: an `idx` column for explicit sort order; if absent, order by `id` or `date_time`.

**Important:** Both **incoming messages** (from the channel, e.g. WhatsApp) and **outgoing messages** (from staff or from the AI) must be saved with the same function and the same table. Staff replies are typically stored with `message.type = 'ai'` so they appear on the “agent” side in the UI.

---

## 2. How messages get persisted

### 2.1 Incoming message (user/customer sends a message)

1. **Webhook** receives the message (e.g. POST from Meta WhatsApp).
2. **Immediately** after parsing and validating:
   - Build `session_id` (e.g. `PREFIX` + normalized phone number).
   - Call a single **save function**, e.g. `saveMessage(sessionId, 'human', content, customer)`.
3. The save function **inserts one row** into `chatbot_history` with:
   - `session_id`, `message` (type `human`, content), `customer`, `date_time`.
4. Then (if applicable) run AI logic and send the reply; when the reply is sent, **persist the reply** with the same save function as `type: 'ai'`.

Rule: **Persist the incoming message before or as soon as you start processing it.** Do not rely on the UI or polling to “create” the message; the backend insert is the only write.

### 2.2 Outgoing message (staff sends from dashboard)

1. **API route** (e.g. `POST /api/admin/whatsapp/send-message`) receives `message`, `customerName`, `customerNumber`.
2. Send the message via the channel API (e.g. WhatsApp Cloud API).
3. **Immediately after** a successful send, call the **same** save function:  
   `saveMessage(sessionId, 'ai', content, { number, name })`.  
   This ensures the message appears in the chat and in history; the UI will show it via realtime (see below).

Rule: **Every message sent by staff must be written to the same table.** No separate “outbox” table; one table for the full thread.

---

## 3. How the UI shows messages almost instantly (Realtime)

### 3.1 Realtime subscription (Supabase)

- The **dashboard** (client) subscribes to **database changes** on the messages table, not to a custom WebSocket or polling.
- Use **Supabase Realtime** `postgres_changes` with:
  - **event:** `INSERT`
  - **schema:** `public`
  - **table:** `chatbot_history` (or your table name)

- **Client:** Use the **browser Supabase client** (createClient with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Realtime runs in the browser; do not use the server-only admin client for this subscription.

- **Subscription scope:** Listen to **all INSERTs** on that table. Filter in code by `session_id` so you only update the open conversation or the conversation list as needed.

### 3.2 What to do when an INSERT payload is received

1. **Parse the payload**  
   The payload contains `payload.new` (the new row). Read at least:
   - `session_id`
   - `message` (jsonb): `type` ('human' | 'ai'), `content`
   - `customer` (jsonb): `number`, `name`
   - `date_time` (or `created_at`)
   - `id` (and `idx` if present)

2. **Build a single “message” object** for the UI (e.g. `WhatsappMessage`):  
   `id`, `sessionId`, `senderType` (from `message.type`), `content`, `customerName`, `customerNumber`, `createdAt`.

3. **Deduplicate**  
   Before appending to state, check that a message with the same `id` is not already in the current list (e.g. the user might have sent from the dashboard and already optimistically added it). If `id` exists, skip adding.

4. **Update the right conversation**
   - If `session_id === selectedSessionId`: **Append** the new message to the `messages` state for the open thread. Sort the list by `id` or `date_time` so order is correct. Optionally trigger a smooth scroll to the bottom after a short timeout (e.g. 100 ms) so the new message is visible.
   - If the new message is for **another** conversation: update the **conversations list** (e.g. refetch list or patch the last message for that `session_id`) and, if you track “unread” per conversation, mark that conversation as having a new message if `message.type === 'human'`.

5. **Refresh conversation list**  
   On every INSERT you can refetch the conversations list (e.g. `GET /api/admin/whatsapp/conversations`) so the “last message” preview and order stay correct. Alternatively you can update the list in memory for the affected `session_id` to avoid an extra request.

### 3.3 Subscription lifecycle

- **Subscribe** when the dashboard (WhatsApp/chat) page is mounted.
- **Unsubscribe** in the effect cleanup (on unmount or when dependencies change) to avoid duplicate listeners and leaks.
- Use a **ref** to hold the channel so cleanup can unsubscribe the correct channel.
- Dependencies: include `selectedSessionId` in the effect so the handler can compare `session_id` with the currently selected conversation.

### 3.4 Enabling Realtime in Supabase

- In Supabase: **Database → Replication** (or Realtime): ensure the messages table is in the **Realtime publication** so that INSERT (and optionally UPDATE/DELETE) events are broadcast.
- RLS: if enabled, the anon key must be allowed to receive Realtime events for that table (Supabase uses the publication; RLS applies to which rows are broadcast when using filters; for “broadcast all inserts” the table must be in the publication).

---

## 4. End-to-end flows (summary)

### User sends a message (e.g. WhatsApp)

1. Meta sends POST to webhook → webhook parses sender and text.
2. Webhook calls `saveMessage(sessionId, 'human', text, customer)` → **one INSERT** into `chatbot_history`.
3. Supabase broadcasts the INSERT via Realtime.
4. Dashboard (if open) receives the event; if `session_id` matches the open conversation, appends the row to `messages` (after dedupe) and re-sorts; message appears almost instantly.
5. Webhook then runs AI (if in control), sends reply, and calls `saveMessage(sessionId, 'ai', replyContent, customer)` → second INSERT → same Realtime flow so the reply appears in the same conversation.

### Staff sends a message from dashboard

1. User clicks Send; frontend calls `POST /api/admin/whatsapp/send-message` with `message`, `customerName`, `customerNumber`.
2. API sends the message via the channel API (e.g. WhatsApp).
3. API calls `saveMessage(sessionId, 'ai', message, { number, name })` → **one INSERT** into `chatbot_history`.
4. Supabase broadcasts the INSERT.
5. Dashboard receives it; if it’s for the open conversation, appends to `messages` (after dedupe). Staff sees their own message appear without a full refresh. No need to optimistically add the message on the client if you rely on Realtime; if you do optimistic UI, still dedupe by `id` when the realtime payload arrives.

---

## 5. Implementation checklist for the Cursor agent

- [ ] **One table** for all chat messages (`chatbot_history` or equivalent) with `id`, `session_id`, `message` (jsonb), `customer` (jsonb), `date_time`.
- [ ] **Single save function** used by both webhook and send-message API (e.g. `saveWhatsAppMessage` or `saveMessage`). Signature: `(sessionId, messageType: 'human' | 'ai', content, customer, optionalMetadata?)`.
- [ ] **Webhook:** Persist incoming message with `messageType: 'human'` as soon as the message is parsed; then run AI/send reply and persist reply with `messageType: 'ai'`.
- [ ] **Send-message API:** After successfully sending via the channel API, call the same save function with `messageType: 'ai'`.
- [ ] **Supabase Realtime:** Enable Realtime for the messages table (publication). Client subscribes to `postgres_changes` with `event: 'INSERT'`, `schema: 'public'`, `table: 'chatbot_history'`.
- [ ] **Browser client:** Use the public Supabase client (anon key) for the subscription; do not use the server-only admin client in the browser.
- [ ] **Handler:** On INSERT, parse `payload.new` into a message object; deduplicate by `id`; if `session_id === selectedSessionId`, append to `messages` and sort; optionally scroll to bottom; if different conversation, refresh or update conversation list and unread state.
- [ ] **Cleanup:** Unsubscribe from the Realtime channel in the effect cleanup.

Following this ensures every message is persisted exactly once in one place and appears in the chat window almost instantly for both user and staff messages.
