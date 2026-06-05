import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // better-sqlite3 is a native module; keep it out of the server bundle so its
  // .node binding is required from node_modules at runtime.
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
