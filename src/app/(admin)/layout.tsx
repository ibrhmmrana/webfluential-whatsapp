import { cookies } from "next/headers";
import { createHmac } from "crypto";
import DashboardLayoutClient from "./DashboardLayoutClient";
import AdminLoginForm from "./AdminLoginForm";

const COOKIE_NAME = process.env.ADMIN_DASH_COOKIE_NAME ?? "app_admin_auth";

function isAuthedServer(): boolean {
  const expectedPassword = process.env.ADMIN_DASH_PASSWORD;
  const secret = process.env.ADMIN_DASH_COOKIE_SECRET;
  if (!expectedPassword || !secret) return false;

  const cookieStore = cookies();
  const cookieValue = cookieStore.get(COOKIE_NAME)?.value;
  if (!cookieValue) return false;

  const expectedHash = createHmac("sha256", secret).update(expectedPassword).digest("hex");
  return cookieValue === expectedHash;
}

export const metadata = {
  title: "Webfluential",
  robots: "noindex, nofollow",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authed = isAuthedServer();

  if (!authed) {
    return (
      <div className="admin-login-wrap">
        <AdminLoginForm />
      </div>
    );
  }

  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
