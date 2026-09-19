import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Uploaded images are written outside the bundle and streamed back by
  // /api/image/[id], so no remote image hosts are needed.
  serverExternalPackages: ["@prisma/client"],
  experimental: {
    // Scan uploads are capped at 8 MB in the route handler too (lib/config.ts).
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
