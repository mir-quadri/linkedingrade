import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse / pdfjs-dist mutate globals and load worker stubs at module
  // init. Bundling them through webpack/turbopack triggers the
  // "Object.defineProperty called on non-object" failure observed when the
  // /api/audit route runs. Keeping them external means Next loads them via
  // Node's resolver at runtime, matching the standalone smoke test.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
};

export default nextConfig;
