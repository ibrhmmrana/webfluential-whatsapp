import "./globals.css";

export const metadata = {
  title: "Webfluential",
  description: "WhatsApp Webhook Integration",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="font-sans">
      <body className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased" style={{ fontFamily: "var(--font-sans)" }}>
        {children}
      </body>
    </html>
  );
}
