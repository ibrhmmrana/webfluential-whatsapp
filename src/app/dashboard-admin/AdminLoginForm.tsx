"use client";

import { useState } from "react";

export default function AdminLoginForm() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

    window.location.href = "/";
  }

  return (
    <div className="admin-login">
      <h1 className="admin-login__title">Admin Login</h1>
      <form onSubmit={handleSubmit} className="admin-login__form">
        <input
          type="email"
          name="email"
          placeholder="Email"
          autoComplete="email"
          required
          className="admin-login__input"
        />
        <input
          type="password"
          name="password"
          placeholder="Password"
          autoComplete="current-password"
          required
          className="admin-login__input"
        />
        <button type="submit" disabled={loading} className="admin-login__btn">
          {loading ? "Signing in..." : "Sign in"}
        </button>
        {error && <p className="admin-login__error">{error}</p>}
      </form>
    </div>
  );
}
