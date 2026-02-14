"use client";

import { useState } from "react";

function IconEye() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function IconEyeOff() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export default function AdminLoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement)?.value?.trim();
    const password = (form.elements.namedItem("password") as HTMLInputElement)?.value?.trim();

    if (!email || !password) {
      setError("Email and password are required");
      setLoading(false);
      return;
    }

    // Server-side login: no client-side Supabase auth to avoid dual-write cookie conflicts
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ email, password }),
    });

    const body = await res.json();

    if (!res.ok) {
      setError(body.error ?? "Login failed");
      setLoading(false);
      return;
    }

    console.log("[auth] server login response:", body);

    // Full page reload to pick up the session cookie
    window.location.href = "/";
  }

  return (
    <div className="admin-login">
      <img
        src="/webfluential%20favicon.svg"
        alt=""
        className="admin-login__logo"
        width={64}
        height={64}
      />
      <h1 className="admin-login__title">WhatsApp Admin</h1>
      <p className="admin-login__hint">Don&apos;t have an account? Contact an admin.</p>
      <form onSubmit={handleSubmit} className="admin-login__form">
        <div className="admin-login__field">
          <label htmlFor="admin-login-email" className="admin-login__label">Email</label>
          <input
            id="admin-login-email"
            type="email"
            name="email"
            placeholder="Email"
            autoComplete="email"
            required
            className="admin-login__input"
          />
        </div>
        <div className="admin-login__field">
          <div className="admin-login__password-header">
            <label htmlFor="admin-login-password" className="admin-login__label">Password</label>
            <button
              type="button"
              className="admin-login__show-password"
              onClick={() => setShowPassword((s) => !s)}
              aria-pressed={showPassword}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              <span className="admin-login__show-password-icon" aria-hidden>
                {showPassword ? <IconEyeOff /> : <IconEye />}
              </span>
              <span className="admin-login__show-password-text">
                {showPassword ? "Hide" : "Show"} password
              </span>
            </button>
          </div>
          <input
            id="admin-login-password"
            type={showPassword ? "text" : "password"}
            name="password"
            placeholder="Password"
            autoComplete="current-password"
            required
            className="admin-login__input"
          />
        </div>
        <button type="submit" disabled={loading} className="admin-login__btn">
          {loading ? "Signing in..." : "Login"}
        </button>
        {error && <p className="admin-login__error">{error}</p>}
      </form>
    </div>
  );
}
