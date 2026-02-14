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
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
