import Link from "next/link";

export default function HomePage() {
  return (
    <div className="dashboard-home">
      <h1 className="dashboard-home__title">Admin</h1>
      <p className="dashboard-home__desc">
        Manage communications and settings from here.
      </p>
      <div className="dashboard-home__cards">
        <Link href="/whatsapp" className="dashboard-home__card">
          <h3 className="dashboard-home__card-title">WhatsApp</h3>
          <p className="dashboard-home__card-desc">
            View conversations, take over from AI, and send messages.
          </p>
        </Link>
      </div>
      <p className="dashboard-home__footer">Webfluential ©{new Date().getFullYear()}</p>
    </div>
  );
}
