import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep sql.js out of the server bundle so it's required from node_modules at
  // runtime; this avoids bundler issues with its asset/file resolution.
  serverExternalPackages: ["sql.js"],
};

export default nextConfig;
