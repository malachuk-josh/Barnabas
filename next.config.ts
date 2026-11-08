import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // node-redis is only used when REDIS_URL is set; keep it out of the client bundle.
  serverExternalPackages: ["redis"],
};

export default nextConfig;
