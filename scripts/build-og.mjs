// One-off renderer: /design/og-image.svg → /public/og.png (1200×630 @ 2x).
// Downloads Geist + Geist Mono TTFs from Google Fonts so resvg can shape text.

import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SVG_PATH = resolve(ROOT, "design/og-image.svg");
const OUT_PATH = resolve(ROOT, "public/og.png");
const FONT_DIR = resolve(ROOT, "scripts/.font-cache");

// CSS endpoint returns TTF links when a desktop UA is sent.
const CSS_URL =
  "https://fonts.googleapis.com/css2?family=Geist:wght@500;700&family=Geist+Mono:wght@400&display=swap";
// Old UA gets us TTF instead of woff2 — resvg-js can't decode woff2.
const UA = "Mozilla/4.0";

async function fetchFontFiles() {
  await mkdir(FONT_DIR, { recursive: true });
  const css = await (await fetch(CSS_URL, { headers: { "User-Agent": UA } })).text();
  const urls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+\.ttf)\)/g)].map(
    (m) => m[1],
  );
  if (urls.length === 0) throw new Error("Could not parse font URLs from Google Fonts CSS.");

  const paths = [];
  for (const url of urls) {
    const name = url.split("/").pop();
    const dest = resolve(FONT_DIR, name);
    if (!existsSync(dest) || (await stat(dest)).size === 0) {
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await writeFile(dest, buf);
    }
    paths.push(dest);
  }
  return paths;
}

async function main() {
  const fontFiles = await fetchFontFiles();
  const svg = await readFile(SVG_PATH, "utf8");

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: 2400 }, // 2x density
    background: "#0F2138",
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: "Geist",
    },
  });
  const png = resvg.render().asPng();
  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, png);

  // eslint-disable-next-line no-console
  console.log(`Wrote ${OUT_PATH} (${png.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
