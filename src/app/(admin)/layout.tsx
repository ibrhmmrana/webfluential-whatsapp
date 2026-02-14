export const dynamic = "force-dynamic";

import { createClient } from "@/lib/supabase/server";
import DashboardLayoutClient from "./DashboardLayoutClient";
import AdminLoginForm from "./AdminLoginForm";

export const metadata = {
  title: "Webfluential",
  robots: "noindex, nofollow",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="admin-login-wrap">
        <AdminLoginForm />
      </div>
    );
  }

  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
