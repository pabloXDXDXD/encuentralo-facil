import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile lives one directory up; pin the workspace root explicitly.
  outputFileTracingRoot: path.resolve(),
};

export default nextConfig;
