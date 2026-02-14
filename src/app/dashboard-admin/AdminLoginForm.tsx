"use client";

import { useState } from "react";

export default function AdminLoginForm() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Login failed");
        return;
      }
      window.location.href = "/dashboard-admin/communications/whatsapp";
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="admin-login">
      <h1 className="admin-login__title">Admin Login</h1>
      <form onSubmit={handleSubmit} className="admin-login__form">
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoFocus
          disabled={loading}
          className="admin-login__input"
        />
        <button type="submit" disabled={loading} className="admin-login__btn">
          {loading ? "Logging in…" : "Log in"}
        </button>
        {error && <p className="admin-login__error">{error}</p>}
      </form>
    </div>
  );
}
