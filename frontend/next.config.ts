import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // Avoid blocking Vercel builds; local typecheck still enforced separately.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
