import type { NextConfig } from "next";

/**
 * Care is now Shepherding (1 Peter 5:2). The old /care pages, and deep links into them such as
 * /care/cases/{id} or /care/guests#{id}, redirect to their /shepherding equivalents; the query string
 * is kept. The API stays at /api/care.
 */
export const legacyRedirects = [
  { source: "/care", destination: "/shepherding", permanent: true },
  { source: "/care/:path*", destination: "/shepherding/:path*", permanent: true },
];

const nextConfig: NextConfig = {
  // node-redis is only used when REDIS_URL is set; keep it out of the client bundle.
  serverExternalPackages: ["redis"],
  async redirects() {
    return legacyRedirects;
  },
};

export default nextConfig;
