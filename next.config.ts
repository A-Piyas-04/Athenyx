import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: process.env.ATHENYX_PREVIEW === "1" ? false : undefined,
  // Athenyx renders per-user dashboard data, so pages are dynamic by default.
  // `cacheComponents` is intentionally left off to keep data access simple.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
