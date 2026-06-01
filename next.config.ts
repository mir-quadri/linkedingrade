import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse / pdfjs-dist mutate globals and load worker stubs at module
  // init. Bundling them through webpack/turbopack triggers the
  // "Object.defineProperty called on non-object" failure observed when the
  // /api/audit route runs. Keeping them external means Next loads them via
  // Node's resolver at runtime, matching the standalone smoke test.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],

  // Belt-and-suspenders for the pdfjs-dist worker file. The static
  // `import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs'`
  // in `lib/pdf/disablePdfjsWorker.ts` SHOULD already prompt Vercel's
  // output-file-tracer to copy this file into /var/task/node_modules/,
  // but the prior production failure was exactly because the file
  // didn't land there — so we force it explicitly here.
  outputFileTracingIncludes: {
    "/api/audit": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.js",
    ],
  },
};

export default nextConfig;
