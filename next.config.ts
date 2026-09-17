import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;

export default nextConfig;
