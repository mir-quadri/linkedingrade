import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse / pdfjs-dist mutate globals and load worker stubs at module
  // init. Bundling them through webpack/turbopack triggers the
  // "Object.defineProperty called on non-object" failure observed when the
  // /api/audit route runs. Keeping them external means Next loads them via
  // Node's resolver at runtime, matching the standalone smoke test.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],

  // Per-audit result pages are private share links. They're NOT disallowed
  // in robots.txt (a crawler must be able to fetch them to see noindex);
  // instead every response under /audit/result/ — including 404s for
  // unknown or ungated IDs, which never render the page's own metadata —
  // carries X-Robots-Tag, alongside the page's <meta name="robots">.
  async headers() {
    return [
      {
        source: "/audit/result/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
    ];
  },

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
