import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel deployment compatibility
  outputFileTracingRoot: __dirname,
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "eburon.ai" },
    ],
  },
  // Exclude CLI package from server bundle
  serverExternalPackages: ["pg", "firebase-admin"],
};

export default nextConfig;
