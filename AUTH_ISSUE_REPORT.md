# Authentication Issue Report: "Not signed in" on refresh

**Purpose of this document:** Handoff for debugging. Assume the reader has no prior context on this project.

---

## 1. Project overview

- **App:** Next.js 14 (App Router) app called "Webfluential" — an internal admin dashboard plus WhatsApp AI agent.
- **Stack:** Next.js 14.2, React 18, Supabase (database + auth), `@supabase/ssr` for cookie-based auth.
- **Hosting:** Deployed on Vercel. **Production URL uses a custom domain:** `https://webfluential.intakt.co.za` (not the default `*.vercel.app`).
- **Auth:** Supabase Auth only. Email + password sign-in; **sign-up is disabled** in Supabase. Users are created manually in Supabase Dashboard. Session is intended to be stored in cookies via `@supabase/ssr` so both server and client can use it.

---

## 2. Observed behaviour (the bug)

1. User opens the app on production (e.g. `https://webfluential.intakt.co.za`).
2. User signs in with email + password. Login succeeds; they are redirected to the home page and see the dashboard (sidebar with "Home", "WhatsApp", "Log out").
3. User navigates to the WhatsApp page (`/whatsapp`). They see the layout (sidebar) but in the main content area a **red error banner** appears: **"Not signed in"**.
4. The same happens on **page refresh**: layout still shows (user appears “logged in”), but the WhatsApp page shows "Not signed in" and no conversations load.
5. So: **server-side layout sees the user as authenticated; client-side API calls do not.**

---

## 3. How auth is supposed to work

### 3.1 Sign-in (client)

- **File:** `src/app/(admin)/AdminLoginForm.tsx`
- User submits email + password. Code uses `createClient()` from `@/lib/supabase/client` (Supabase’s `createBrowserClient` from `@supabase/ssr`).
- Calls `supabase.auth.signInWithPassword({ email, password })`.
- On success, does `window.location.href = "/"`. The SSR browser client is expected to persist the session in **cookies** (so the server can read it).

### 3.2 Server: who is allowed to see the dashboard

- **File:** `src/app/(admin)/layout.tsx`
- It’s an async Server Component. It calls `createClient()` from `@/lib/supabase/server` (which uses `cookies()` from `next/headers`) and then `supabase.auth.getUser()`.
- If `user` is null → show login form. If `user` exists → render the dashboard layout (sidebar + children).
- So the **first request** (e.g. GET `/whatsapp`) is authenticated using whatever `cookies()` returns on the server for that request.

### 3.3 Client: loading WhatsApp data

- **File:** `src/app/(admin)/whatsapp/page.tsx`
- It’s a Client Component. On mount it calls `fetch("/api/admin/whatsapp/conversations", { credentials: "include", headers: await getAuthHeaders() })`.
- `getAuthHeaders()` uses `supabaseClient.auth.getSession()` and, if there is a session, returns `{ Authorization: "Bearer " + session.access_token }`.
- So the client sends **both** cookies (`credentials: "include"`) and an **Authorization: Bearer** token when available.

### 3.4 API route: who is allowed to read conversations

- **File:** `src/app/api/admin/whatsapp/conversations/route.ts`
- `GET` handler receives `request: NextRequest`.
- It calls `getAuthUser(request)` from `@/lib/supabase/server`.
- If `getAuthUser(request)` returns null → respond with **401** and `{ error: "Unauthorized", reason: "Not signed in" }` (this is the message the user sees).
- If it returns a user → load conversations and return 200.

### 3.5 How `getAuthUser(request)` works

- **File:** `src/lib/supabase/server.ts`
- **Step 1:** Build a Supabase server client that reads cookies **from the request**: `createClientFromRequest(request)`. That client’s `getAll()` returns `request.cookies.getAll()` (so we use the exact cookies the browser sent for that API request).
- **Step 2:** Call `supabase.auth.getUser()`. If it returns a user, return that user.
- **Step 3:** If no user, look at `request.headers.get("Authorization")`. If it starts with `"Bearer "`, take the token and call `supabase.auth.getUser(token)`. If that returns a user, return that user.
- **Step 4:** Otherwise return null → API returns 401 "Not signed in".

So the API can authenticate either from **cookies on the request** or from the **Bearer token** in the header.

### 3.6 Middleware (session refresh)

- **File:** `src/middleware.ts`
- Runs on every request (except static assets). Creates a Supabase server client with:
  - `getAll()`: from `request.cookies`
  - `setAll(cookiesToSet)`: (1) `request.cookies.set(name, value)` for each cookie, (2) `response = NextResponse.next({ request })`, (3) `response.cookies.set(name, value, options)` for each cookie.
- Then calls `await supabase.auth.getUser()` to refresh the session if needed.
- Intent: refreshed tokens are written to both the **response** (so the browser updates cookies) and the **request** (so downstream server code might see them). **Note:** In Next.js, middleware is documented to modify the *response*, not the request; whether downstream code (layout, route handlers) actually sees `request.cookies` changes is unclear and may be the source of bugs.

---

## 4. The contradiction (why this is confusing)

- **Layout sees the user:** For the same production URL, the layout (Server Component) runs and `createClient()` + `getUser()` returns a user, so the dashboard (including sidebar) is rendered. That means for the **document request** (e.g. GET `/whatsapp`), the server’s view of cookies (via `cookies()` from `next/headers`) contains a valid session.
- **API does not see the user:** A separate request is made by the browser: GET `/api/admin/whatsapp/conversations` with `credentials: "include"` and optionally `Authorization: Bearer <token>`. The API route calls `getAuthUser(request)`, which uses `request.cookies` and the Bearer token. **Both** paths return no user → 401 "Not signed in".

So we have:

- Same origin: `https://webfluential.intakt.co.za`.
- Document request: server sees valid session (layout shows dashboard).
- API request: server sees no valid session (401).

Possible explanations (to be verified by the fixer):

1. **Cookies not sent on the API request**  
   For the fetch to `/api/admin/whatsapp/conversations`, the browser might not be sending the Supabase auth cookies. Reasons could include: cookie domain/path, `SameSite`/`Secure`, or the way `@supabase/ssr` sets cookies on the custom domain.

2. **Bearer token missing or invalid**  
   If the client’s `getAuthHeaders()` runs before the session is fully available (e.g. right after navigation or refresh), `getSession()` might return null, so no `Authorization` header is sent. Or the token might be expired and `getUser(token)` fails.

3. **Different cookie store for document vs API**  
   In Next.js, `cookies()` in a Route Handler might not be the same as the cookies on the incoming request (e.g. different API or timing). We tried to avoid this by using `request.cookies` in the API via `createClientFromRequest(request)`, but if the browser never sends cookies on that request, `request.cookies` would still be empty.

4. **Custom domain / proxy**  
   With a custom domain (e.g. `webfluential.intakt.co.za`) behind Vercel, cookies might be set for a different host or path, or a proxy might strip or alter the `Cookie` or `Authorization` header for API routes.

5. **Middleware not propagating cookies**  
   Even if middleware refreshes and calls `request.cookies.set(...)`, Next.js might not pass that mutated request to Route Handlers, so the API might always see the original request (without refreshed cookies). Layout might be reading cookies in a different way (e.g. from a different context) and therefore see the session.

---

## 5. Relevant files (short reference)

| Path | Role |
|------|------|
| `src/lib/supabase/server.ts` | `createClient()` (uses `cookies()`), `createClientFromRequest(request)`, `getAuthUser(request)` |
| `src/lib/supabase/client.ts` | Browser Supabase client: `createClient()` using `createBrowserClient` from `@supabase/ssr` |
| `src/lib/supabaseClient.ts` | Exports `supabaseClient` = browser client (used in WhatsApp page for `getSession()` and Realtime) |
| `src/middleware.ts` | Runs on each request; creates Supabase client from `request.cookies`, calls `getUser()`, implements `setAll` to update request + response cookies |
| `src/app/(admin)/layout.tsx` | Server Component; uses `createClient()` + `getUser()` to decide login form vs dashboard |
| `src/app/(admin)/AdminLoginForm.tsx` | Client Component; `signInWithPassword`, then `window.location.href = "/"` |
| `src/app/(admin)/whatsapp/page.tsx` | Client Component; fetches `/api/admin/whatsapp/conversations` with `credentials: "include"` and `getAuthHeaders()` (Bearer token) |
| `src/app/api/admin/whatsapp/conversations/route.ts` | GET handler; `getAuthUser(request)` → 401 if null |

---

## 6. Environment

- **Production URL:** `https://webfluential.intakt.co.za` (custom domain, not `*.vercel.app`).
- **Env vars (relevant):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and Supabase service key for DB). Sign-up is disabled in Supabase; users exist in Supabase Auth and can sign in.
- **Repro:** Sign in on production → go to `/whatsapp` or refresh → "Not signed in" in the WhatsApp area while the rest of the dashboard (layout) still shows.

---

## 7. What has already been tried (no success)

1. **Cookie-based login only** – Original custom cookie auth; cookies were not sent or not persisted on production (e.g. after redirect).
2. **Switching to Supabase Auth** – Session stored via `@supabase/ssr` in cookies; layout sees user, API still returns 401.
3. **Using Next.js `response.cookies.set()` for login** – No change.
4. **Fetch-based login with 200 + Set-Cookie** – No change.
5. **`credentials: "include"` on all admin API fetches** – Ensured cookies are sent; still 401.
6. **Middleware updating both request and response in `setAll`** – Intended so downstream code “sees” refreshed cookies; still 401.
7. **API routes using `request.cookies`** – Introduced `createClientFromRequest(request)` and `getAuthUser(request)` so the API uses the same request as received; still 401.
8. **Bearer token fallback** – Client sends `Authorization: Bearer <access_token>` from `getSession()`; API uses `getUser(token)` if cookies don’t yield a user; still 401 (suggests either the token isn’t sent, or it’s invalid/expired when the API runs).

---

## 8. Additional context: path change and cookie details

### Path change
The app originally used `/dashboard-admin/communications/whatsapp` for the WhatsApp page. It was later changed so the dashboard is at `/` (home) and WhatsApp is at `/whatsapp`. The old `/dashboard-admin/` routes still exist in the codebase (`src/app/dashboard-admin/`) with their own layout, pages, and a `DashboardLayoutClient` that links to the old paths. These old routes also check Supabase auth.

**Is the path change the cause?** Probably not directly. Supabase SSR uses `DEFAULT_COOKIE_OPTIONS` with `path: "/"` (file: `node_modules/@supabase/ssr/src/utils/constants.ts`), so cookies are set at the root and should be sent on all paths including `/api/...`. But there could be **indirect issues**: stale cookies from old auth (cookie name `app_admin_auth`), conflicting route layouts, or Vercel caching old builds.

### Cookie attributes (from `@supabase/ssr`)
```
DEFAULT_COOKIE_OPTIONS = {
  path: "/",
  sameSite: "lax",
  httpOnly: false,    // <-- client JS CAN read these via document.cookie
  maxAge: 34560000,   // 400 days
}
```

Since `httpOnly: false`, the browser client (`createBrowserClient`) reads/writes Supabase auth cookies via `document.cookie`. So the client-side `getSession()` should be able to read the session. If `getAuthHeaders()` returns an empty object (no Bearer token), that means `getSession()` is returning no session on the client -- which suggests the **cookies are either not being set by `signInWithPassword`**, or they **are set but `getSession()` cannot parse them** (e.g. wrong encoding, stale/corrupt cookies).

### Browser client is NOT a singleton
`createBrowserClient` from `@supabase/ssr` is **not** a singleton by default. Each call creates a new instance. In this app:
- `AdminLoginForm` calls `createClient()` → new instance → `signInWithPassword()` → session stored in cookies via `document.cookie`.
- `supabaseClient.ts` calls `createClient()` at module load → different instance → reads session from `document.cookie`.
- These should share the same cookies, but if there's a timing or initialization issue, the second instance might not see the session yet.

---

## 9. What to verify / try next

1. **Network tab:** For the failing request to `/api/admin/whatsapp/conversations`:  
   - Is the `Cookie` header present and does it contain Supabase auth cookies (e.g. `sb-...-auth-token`)?  
   - Is the `Authorization: Bearer ...` header present? If yes, is the token non-empty and JWT-shaped?

2. **Server-side logs:** In the API route, temporarily log (or return in dev):  
   - Whether `request.cookies.getAll()` contains any Supabase-related cookies.  
   - Whether `Authorization` header is present and what `getUser(token)` returns (user vs error).

3. **Client-side:** Right before the fetch, log the result of `getSession()` and whether `getAuthHeaders()` returns a non-empty `Authorization` header. Confirm the token is present and that it’s the same as what the server receives.

4. **Cookie attributes:** Inspect the Supabase auth cookies in the browser (Application → Cookies). Check domain, path, `SameSite`, `Secure`, and whether they’re present for `webfluential.intakt.co.za` when the API request is made.

5. **Alternative auth for API:** If cookies and Bearer token continue to fail on the custom domain, consider authenticating API routes in a different way (e.g. a separate API key or server-side session store) while keeping Supabase Auth for the login UI and layout.

---

## 9. Summary for the fixer

- **Symptom:** After sign-in on production (custom domain), the dashboard layout shows (user is “logged in”) but the WhatsApp page shows "Not signed in" and API `GET /api/admin/whatsapp/conversations` returns 401.
- **Cause (suspected):** The API request either does not receive the auth cookies, or the Bearer token is missing/invalid, or the way Next.js/Vercel/custom domain serves cookies or the request object differs between the document request and the API request.
- **Goal:** Ensure that when the user is signed in and the layout shows the dashboard, the same user is recognized in API routes (so `getAuthUser(request)` returns the user and the "Not signed in" error goes away), on both initial load and refresh, on the custom domain.
