"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

async function getAuthHeaders(): Promise<Record<string, string>> {
  if (!supabaseClient) return {};
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (session?.access_token) return { Authorization: `Bearer ${session.access_token}` };
  return {};
}

function IconHome() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
function IconWhatsApp() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="currentColor" aria-hidden>
      <path d="M26.576 5.363c-2.69-2.69-6.406-4.354-10.511-4.354-8.209 0-14.865 6.655-14.865 14.865 0 2.732 0.737 5.291 2.022 7.491l-0.038-0.070-2.109 7.702 7.879-2.067c2.051 1.139 4.498 1.809 7.102 1.809h0.006c8.209-0.003 14.862-6.659 14.862-14.868 0-4.103-1.662-7.817-4.349-10.507l0 0zM16.062 28.228h-0.005c-0 0-0.001 0-0.001 0-2.319 0-4.489-0.64-6.342-1.753l0.056 0.031-0.451-0.267-4.675 1.227 1.247-4.559-0.294-0.467c-1.185-1.862-1.889-4.131-1.889-6.565 0-6.822 5.531-12.353 12.353-12.353s12.353 5.531 12.353 12.353c0 6.822-5.53 12.353-12.353 12.353h-0zM22.838 18.977c-0.371-0.186-2.197-1.083-2.537-1.208-0.341-0.124-0.589-0.185-0.837 0.187-0.246 0.371-0.958 1.207-1.175 1.455-0.216 0.249-0.434 0.279-0.805 0.094-1.15-0.466-2.138-1.087-2.997-1.852l0.010 0.009c-0.799-0.74-1.484-1.587-2.037-2.521l-0.028-0.052c-0.216-0.371-0.023-0.572 0.162-0.757 0.167-0.166 0.372-0.434 0.557-0.65 0.146-0.179 0.271-0.384 0.366-0.604l0.006-0.017c0.043-0.087 0.068-0.188 0.068-0.296 0-0.131-0.037-0.253-0.101-0.357l0.002 0.003c-0.094-0.186-0.836-2.014-1.145-2.758-0.302-0.724-0.609-0.625-0.836-0.637-0.216-0.010-0.464-0.012-0.712-0.012-0.395 0.010-0.746 0.188-0.988 0.463l-0.001 0.002c-0.802 0.761-1.3 1.834-1.3 3.023 0 0.026 0 0.053 0.001 0.079l-0-0.004c0.131 1.467 0.681 2.784 1.527 3.857l-0.012-0.015c1.604 2.379 3.742 4.282 6.251 5.564l0.094 0.043c0.548 0.248 1.25 0.513 1.968 0.74l0.149 0.041c0.442 0.14 0.951 0.221 1.479 0.221 0.303 0 0.601-0.027 0.889-0.078l-0.031 0.004c1.069-0.223 1.956-0.868 2.497-1.749l0.009-0.017c0.165-0.366 0.261-0.793 0.261-1.242 0-0.185-0.016-0.366-0.047-0.542l0.003 0.019c-0.092-0.155-0.34-0.247-0.712-0.434z" />
    </svg>
  );
}
function IconKnowledge() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8" />
      <path d="M8 11h8" />
    </svg>
  );
}
function IconPrompt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
export default function DashboardLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const homeActive = pathname === "/";
  const whatsappActive = pathname === "/whatsapp";
  const knowledgeActive = pathname === "/knowledge";
  const promptActive = pathname === "/prompt";
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [devMode, setDevMode] = useState(true);
  const [allowedNumbers, setAllowedNumbers] = useState<string[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [whitelistOpen, setWhitelistOpen] = useState(false);
  const [removingNumber, setRemovingNumber] = useState<string | null>(null);
  const [newNumberInput, setNewNumberInput] = useState("");
  const [addingNumber, setAddingNumber] = useState(false);
  const whitelistRef = useRef<HTMLDivElement>(null);

  const fetchSettings = useCallback(async () => {
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/settings", {
      credentials: "include",
      headers: authHeaders,
      cache: "no-store",
    });
    if (!res.ok) return;
    const data = await res.json();
    setDevMode(data.devMode !== false);
    setAllowedNumbers(Array.isArray(data.allowedNumbers) ? data.allowedNumbers : []);
  }, []);

  useEffect(() => {
    fetchSettings().finally(() => setSettingsLoading(false));
  }, [fetchSettings]);

  const handleToggleDevMode = useCallback(async (next: boolean) => {
    setDevMode(next);
    const authHeaders = await getAuthHeaders();
    await fetch("/api/admin/whatsapp/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ devMode: next }),
    });
  }, []);

  const handleRemoveNumber = useCallback(async (digits: string) => {
    setRemovingNumber(digits);
    const next = allowedNumbers.filter((n) => n !== digits);
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ allowedNumbers: next }),
    });
    setRemovingNumber(null);
    if (res.ok) {
      const data = await res.json();
      setAllowedNumbers(Array.isArray(data.allowedNumbers) ? data.allowedNumbers : next);
    }
  }, [allowedNumbers]);

  const handleAddNumber = useCallback(async () => {
    const digits = newNumberInput.replace(/\D/g, "").trim();
    if (!digits || allowedNumbers.includes(digits)) return;
    setAddingNumber(true);
    const next = [...allowedNumbers, digits];
    const authHeaders = await getAuthHeaders();
    const res = await fetch("/api/admin/whatsapp/settings", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ allowedNumbers: next }),
    });
    setAddingNumber(false);
    setNewNumberInput("");
    if (res.ok) {
      const data = await res.json();
      setAllowedNumbers(Array.isArray(data.allowedNumbers) ? data.allowedNumbers : next);
    }
  }, [allowedNumbers, newNumberInput]);

  useEffect(() => {
    if (!whitelistOpen) return;
    const close = (e: MouseEvent) => {
      if (whitelistRef.current && !whitelistRef.current.contains(e.target as Node)) {
        setWhitelistOpen(false);
      }
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [whitelistOpen]);

  const handleLogout = () => {
    window.location.href = "/api/admin/logout";
  };

  return (
    <div className={`dashboard-admin ${sidebarCollapsed ? "dashboard-admin--sidebar-collapsed" : ""}`}>
      <aside className="dashboard-admin__sidebar">
        <div className="dashboard-admin__logo">
          <img
            src="/webfluential%20favicon.svg"
            alt=""
            className="dashboard-admin__logo-icon"
            width={36}
            height={36}
          />
          <span className="dashboard-admin__logo-text">Webfluential</span>
          <button
            type="button"
            className="dashboard-admin__collapse"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((c) => !c)}
          >
            {sidebarCollapsed ? "»" : "«"}
          </button>
        </div>
        <nav className="dashboard-admin__nav">
          <Link
            href="/"
            className={`dashboard-admin__nav-item ${homeActive ? "dashboard-admin__nav-item--active" : ""}`}
          >
            <span className="dashboard-admin__nav-icon"><IconHome /></span>
            <span className="dashboard-admin__nav-item-text">Home</span>
          </Link>
          <Link
            href="/whatsapp"
            className={`dashboard-admin__nav-item ${whatsappActive ? "dashboard-admin__nav-item--active" : ""}`}
          >
            <span className="dashboard-admin__nav-icon"><IconWhatsApp /></span>
            <span className="dashboard-admin__nav-item-text">WhatsApp</span>
          </Link>
          <Link
            href="/knowledge"
            className={`dashboard-admin__nav-item ${knowledgeActive ? "dashboard-admin__nav-item--active" : ""}`}
          >
            <span className="dashboard-admin__nav-icon"><IconKnowledge /></span>
            <span className="dashboard-admin__nav-item-text">Knowledge</span>
          </Link>
          <Link
            href="/prompt"
            className={`dashboard-admin__nav-item ${promptActive ? "dashboard-admin__nav-item--active" : ""}`}
          >
            <span className="dashboard-admin__nav-icon"><IconPrompt /></span>
            <span className="dashboard-admin__nav-item-text">System prompt</span>
          </Link>
        </nav>
        <div className="dashboard-admin__footer">
          {!sidebarCollapsed && (
            <div className="dashboard-admin__footer-mode">
              <div className="dashboard-admin__footer-mode-row">
                <span className={`dashboard-admin__footer-dot ${devMode ? "dashboard-admin__footer-dot--dev" : "dashboard-admin__footer-dot--live"}`} />
                <span className="dashboard-admin__footer-mode-label">
                  {devMode ? "Dev mode" : "Live"}
                </span>
                <button
                  type="button"
                  className={`dashboard-admin__footer-switch ${!devMode ? "dashboard-admin__footer-switch--on" : ""}`}
                  onClick={() => handleToggleDevMode(!devMode)}
                  disabled={settingsLoading}
                  role="switch"
                  aria-checked={!devMode}
                  title={devMode ? "Switch to Live" : "Switch to Dev"}
                >
                  <span className="dashboard-admin__footer-switch-thumb" />
                </button>
              </div>
              {devMode && (
                <div className="dashboard-admin__footer-whitelist" ref={whitelistRef}>
                  <button
                    type="button"
                    className="dashboard-admin__footer-whitelist-link"
                    onClick={(e) => { e.stopPropagation(); setWhitelistOpen((o) => !o); }}
                    aria-expanded={whitelistOpen}
                  >
                    {allowedNumbers.length} whitelisted number{allowedNumbers.length !== 1 ? "s" : ""}
                    <span className="dashboard-admin__footer-whitelist-chevron">{whitelistOpen ? "▴" : "▾"}</span>
                  </button>
                  {whitelistOpen && (
                    <div className="dashboard-admin__footer-whitelist-dropdown">
                      {allowedNumbers.length === 0 ? (
                        <p className="dashboard-admin__footer-whitelist-empty">No numbers yet. Add one below.</p>
                      ) : (
                        <ul className="dashboard-admin__footer-whitelist-list">
                          {allowedNumbers.map((num) => (
                            <li key={num} className="dashboard-admin__footer-whitelist-item">
                              <span className="dashboard-admin__footer-whitelist-num">+{num}</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); handleRemoveNumber(num); }}
                                disabled={removingNumber === num}
                                className="dashboard-admin__footer-whitelist-remove"
                                aria-label={`Remove +${num}`}
                              >
                                {removingNumber === num ? "…" : "Remove"}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="dashboard-admin__footer-whitelist-add">
                        <input
                          type="tel"
                          value={newNumberInput}
                          onChange={(e) => setNewNumberInput(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddNumber())}
                          placeholder="e.g. 27693475825"
                          className="dashboard-admin__footer-whitelist-input"
                          disabled={addingNumber}
                        />
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleAddNumber(); }}
                          disabled={addingNumber || !newNumberInput.replace(/\D/g, "").trim()}
                          className="dashboard-admin__footer-whitelist-add-btn"
                        >
                          {addingNumber ? "…" : "Add"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="dashboard-admin__logout"
            onClick={handleLogout}
            title="Log out"
          >
            <span className="dashboard-admin__logout-icon" aria-hidden><IconLogout /></span>
            <span className="dashboard-admin__logout-text">Log out</span>
          </button>
        </div>
      </aside>
      <main className="dashboard-admin__main">{children}</main>
    </div>
  );
}
