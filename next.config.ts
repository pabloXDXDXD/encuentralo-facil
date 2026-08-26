import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A stray lockfile lives one directory up; pin the workspace root explicitly.
  outputFileTracingRoot: path.resolve(),
  // Los lugares heredan los UUID de las tiendas destiladas (D3), asi que
  // /tienda/:id responde 301 hacia /lugar/:id sin tabla de mapeo.
  // Nota: `permanent: true` emitiria 308; el spec exige 301 literal, que en
  // Next.js solo se obtiene con statusCode.
  redirects: async () => [
    { source: "/tienda/:id", destination: "/lugar/:id", statusCode: 301 },
  ],
};

export default nextConfig;
