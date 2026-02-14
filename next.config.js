/** @type {import('next').NextConfig} */
const nextConfig = {
  async redirects() {
    return [
      { source: "/dashboard-admin", destination: "/", permanent: true },
      { source: "/dashboard-admin/communications/whatsapp", destination: "/whatsapp", permanent: true },
    ];
  },
};

module.exports = nextConfig;
