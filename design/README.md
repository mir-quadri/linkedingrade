# Handoff — LinkedInGrade.com Landing Page & Identity

**Status:** Identity approved · Landing page approved · Ready for implementation
**Date:** 13 May 2026
**For:** linkedingrade.com (Chrome extension that grades any LinkedIn profile)

---

## Overview

This bundle is the final design package for **LinkedInGrade.com** — the marketing landing page for a Chrome extension that audits any LinkedIn profile in 30 seconds and produces a 6-page PDF report with letter grades, recruiter heat maps, before/after rewrites, and a priority action plan.

The brand voice is **Bloomberg / Stripe / The Economist / Monocle** — editorial, data-dense, restrained, honest. It uses letter grades (A through F) because grades are unambiguous. The visual identity is built around a **navy "Stamp" mark with a single red corner block** — reads as approved/graded/stamped.

## About the Design Files

The HTML files in this bundle are **design references** — high-fidelity prototypes showing the intended look, structure, and interactions. They are **not production code** to copy verbatim into the site.

**Your task:** recreate these designs in the target codebase's existing environment using its established patterns and libraries. If no environment exists yet, pick the most appropriate stack (Next.js + Tailwind is recommended for this design — Tailwind because the token values map 1:1, Next.js because of the marketing-page SEO/OG requirements).

## Fidelity

**High-fidelity (pixel-perfect).** Final colors, typography, spacing, hover states, interactions. The hex codes, font weights, letter-spacing values, and section-padding values in `tokens.css` and below are exact and authoritative.

---

## Files in This Bundle

| File | Purpose |
|---|---|
| `Landing Page.html` | The main marketing page — 8 sections, sticky nav, light/dark adaptive, mobile-first. **This is the primary spec.** |
| `LinkedInGrade Identity.html` | Full brand identity — the Stamp mark, construction grid, lockups, applications, color/type spec, six "don'ts." |
| `Brand System.html` | Token system reference — earlier exploration; superseded by the Identity doc but contains the typography scale and additional rationale. |
| `tokens.css` | All design tokens as CSS custom properties — drop into global CSS or translate to Tailwind theme. |
| `assets/logo.svg` | Primary mark on light backgrounds (navy seal + red corner). |
| `assets/logo-reversed.svg` | White seal + red corner — for use on navy/dark backgrounds. |
| `assets/logo-mono.svg` | Single-color version using `currentColor` — for embossing, foil, watermarks. |
| `assets/favicon.svg` | Favicon-optimized version with larger corner radius (12u instead of 6u) — reads cleaner at 16/32px. |

---

## Brand Identity

### The Mark — "The Stamp"

A navy rounded square with a single red corner block in the bottom-right. **No letter, no monogram, no decoration.** Two flat shapes, two colors.

**Construction (canonical):**
- Canvas: 100 × 100 units
- Container: rounded square, `r = 6u`, fill `#0F2138`
- Red block: `(64, 64)` to `(100, 100)`, fill `#C8102E`
  - Outer bottom-right corner inherits parent radius (`r = 6u`)
  - Top edge and left edge are flat (square)
- Negative space in upper-left does as much work as the fill

**SVG (canonical, < 300 bytes):**
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="6" fill="#0F2138"/>
  <path d="M 64 64 L 100 64 L 100 94 A 6 6 0 0 1 94 100 L 64 100 Z" fill="#C8102E"/>
</svg>
```

**Variants** (all in `/assets/`):
- **Primary** (`logo.svg`) — navy seal, red corner. Use on light backgrounds.
- **Reversed** (`logo-reversed.svg`) — white seal, red corner. Use on navy/dark backgrounds.
- **Mono** (`logo-mono.svg`) — single-color using `currentColor`. For foil, embossing, monochrome print.
- **Favicon** (`favicon.svg`) — same composition with `r = 12u` for cleaner small-size rendering.

**Minimum sizes:** 14px for screen, 8mm for print. The red block stays visible at all sizes because it is 36% of the linear edge.

**Clear space:** Minimum 1× cap-height of clear space around the mark on all sides. In horizontal lockup, the mark's height = 1.2× the wordmark's cap height; the gap between mark and wordmark = 0.6× cap-height.

### The Don'ts (non-negotiable)
1. **Don't add letters** inside the seal — no monogram, no initials, no "G"
2. **Don't recolor** — navy + red + white. No teal, no purple, no LinkedIn blue
3. **Don't rotate** — corner block lives in the bottom-right, always
4. **Don't round it** — radius stays at 6u; not a pill, not a circle
5. **Don't add shadow / glow / bevel / gradient** — two flat shapes, full stop
6. **Don't move the block** — it lives at coordinates (64, 64) to (100, 100)

### The Wordmark

**LinkedInGrade** — set in **Geist 700**, tracking `-0.035em`, three capitals (L, I, G), no spaces, no separators. Navy `#0F2138` on light, white `#FFFFFF` on dark. Optional terminal **8×8 red square** ("dot") matching the seal's corner block — appears in wordmark-only lockups, never inside the seal-plus-wordmark composite.

```html
<span style="font-family: 'Geist', sans-serif; font-weight: 700;
             letter-spacing: -0.035em; color: #0F2138;">
  LinkedInGrade<span style="color: #C8102E;">.</span>
</span>
```

---

## Design Tokens

### Colors

| Token | Role | Light hex | Dark hex |
|---|---|---|---|
| `bg` | Page background (warm paper) | `#FAFAF7` | `#0B0B09` |
| `surface` | Card / report background | `#FFFFFF` | `#141413` |
| `surface-sub` | Inset / header strip | `#F2F2EC` | `#1B1B19` |
| `text` | Primary text | `#0E0E0C` | `#F1F0EA` |
| `text-2` | Secondary / body | `#4A4A45` | `#B5B4AB` |
| `text-3` | Muted / labels | `#8A8A82` | `#76756D` |
| `navy` | Brand seal (fixed both modes) | `#0F2138` | `#0F2138` |
| `accent` | Brand red, punctuation | `#C8102E` | `#C8102E` |
| `warning` | Amber, grade C | `#B8730B` | `#E8A547` |
| `danger` | Deep red, grade D/F | `#A8190A` | `#FF6359` |
| `success` | Forest, grade A | `#2D5A3F` | `#6FBA8A` |

**Borders are derived, not tokens:** hairline = `rgba(text, 0.09)`, strong = `rgba(text, 0.18)`, full = `text`.

**Rules:**
- The red accent never exceeds 5% of any composition's surface area
- Never set body text in red
- Never use red as a button background (use `text` color as button bg)
- Navy and red do not change between light and dark modes

### Typography

**Fonts** (both via Google Fonts):
- **Geist** — display, headlines, UI, wordmark. Weights: 300, 400, 500, 600, 700, 800
- **Geist Mono** — labels, scores, masthead chrome, ticker data. Weights: 400, 500

**Optional** (marketing only, never in-product):
- **Instrument Serif** — pulled quotes, press pages

**Embed:**
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">
```

**Type scale:**

| Style | Size | Line-height | Weight | Tracking |
|---|---|---|---|---|
| h1 / display | `clamp(44px, 7vw, 88px)` | 0.96 | 500 | −0.035em |
| h2 / section | `clamp(32px, 4.2vw, 52px)` | 1.02 | 500 | −0.025–0.03em |
| h3 / card | 22–28px | 1.15 | 500 | −0.02em |
| Body | 15–16px | 1.5–1.55 | 400 | −0.005em |
| Caption / small | 13–13.5px | 1.5 | 400 | −0.005em |
| Label (mono UC) | 10.5–11px | 1.0 | 500 | +0.08–0.10em |
| Wordmark | (any) | 1.0 | 700 | −0.035em |

Enable Geist's stylistic alternates: `font-feature-settings: "ss01", "ss02", "cv11";` on body.

### Spacing — 4px base

`4, 8, 12, 16, 24, 32, 48, 64, 96`

| Use | Value |
|---|---|
| Section vertical padding (desktop) | 88–96px |
| Section vertical padding (mobile) | 64px |
| Container max-width | 1240px |
| Container gutter | 24px |
| Card inner padding | 22–24px |
| Sibling gap inside a card | 12px |
| Gap between cards | 24px |
| Gap between sub-sections | 48px |
| Hero vertical padding (desktop) | 80–96px top, 96px bottom |

### Radius

| Token | Value | Use |
|---|---|---|
| `--r-sm` | 4px | Buttons, inputs, tags, badges |
| `--r-md` | 8px | Nested boxes |
| `--r-lg` | 14px | Cards, audit report, modals |

### Shadows

**Effectively none.** Structure is carried by borders and rules, not depth. The only acceptable shadow is `0 1px 0 rgba(text, 0.04)` for the sticky-nav lift on scroll — and even that is optional.

### Icons

**Lucide** (not Phosphor). 1.5px stroke. Round caps. Outline by default, fill only on active states. Never colored unless destructive (`accent`) or affirmative (`success`).

---

## The Landing Page — Sections

The page has **8 sections** in this order. Open `Landing Page.html` in a browser alongside this spec.

### 1. Sticky Nav (`<nav class="nav">`)

- **Height:** 60px
- **Background:** `color-mix(in oklab, var(--bg) 88%, transparent)` with `backdrop-filter: blur(8px)` and saturation `1.2`
- **Bottom border:** 1px solid `var(--border)`
- **Layout:** `display: flex; justify-content: space-between; align-items: center;`
- **Left:** Brand lockup — 24×24 SVG of the Stamp + wordmark "LinkedInGrade." with red period, Geist 600, 17px, `-0.025em`
- **Center (≥900px viewport):** 4 anchor links — "Sample", "How it works", "Built for", "Pricing" — color `text-2`, 14px, hover adds bottom border in accent red. **Hidden below 900px.**
- **Right:** Theme toggle button + primary CTA
  - **Theme toggle:** "⌥ THEME" in mono 11px UC, color `text-3`, `padding: 6px 8px`, 1px border `var(--border)`, radius `--r-sm`. Toggles `[data-theme]` on `<html>` and persists to `localStorage` under key `lig-theme`.
  - **Primary CTA:** "Install free", `btn-primary` style (see Buttons below)

### 2. Hero (`<header class="hero">`)

- **Padding:** 48px top / 56px bottom (mobile), 80px / 96px (desktop ≥ 900px)
- **Layout:** 2-column grid at ≥1000px (`1.05fr .95fr`, gap 64px), single column below
- **Top meta rule** (`.hero-meta`): full-width 1px border-top in `text` color, padding-top 14px, margin-bottom 36px, mono 11px UC, `text-3`. Three flex children: "VOL. 01 NO. 12" / "WED · MAY 13 · 2026" / "THE PROFILE, GRADED" — the first two words in each are `text` color, rest is muted. This is the editorial-masthead move.
- **Headline (`h1`):** "Every LinkedIn profile gets a grade." `clamp(44px, 7vw, 88px)`, line-height 0.96, weight 500, tracking `-0.035em`, balance text-wrap. Final period is wrapped in `<em>` and colored `accent`.
- **Lede paragraph:** `clamp(16px, 1.4vw, 19px)`, line-height 1.55, color `text-2`, max-width 54ch, `text-wrap: pretty`. Bolded fragments inline: "**6-page report**", "**No hedging, no horoscopes.**"
- **Email capture form:**
  - Wrap: `display: flex; flex-direction: column; gap: 8px; max-width: 520px`
  - Row: input + button, flex with `gap: 8px`, wraps below 460px
  - Input: bg `surface`, 1px border `border-2`, radius `--r-sm`, padding `13px 14px`, font 15px, placeholder `text-3`, focus border `text`
  - Button: `btn-primary btn-lg` — see Buttons. Label: "Audit my profile →"
  - Fineprint row below: three pill items separated by `•` dots, font 12px, `text-3` color. Items: "Free for 1 audit · no card", "Chrome & Edge", "SOC 2 in progress"
- **Proof strip:** Below the form, 1px border-top `var(--border)`, padding-top 18px, margin-top 48px. Four cells flexed with `space-between`. Each cell stacks a mono 20px number with a mono 10.5px UC label. Numbers: "38,412", "31s" (the `s` colored `accent`), "C+", "4.8/5". Labels: "Profiles audited", "Median audit", "Avg. grade", "Chrome reviews".
- **Right column — Audit card** (the hero visual): see [Component: Audit Preview Card](#component-audit-preview-card) below.

### 3. § 01 — Sample Audit (`<section id="sample">`)

- **Section padding:** 88px vertical (64 mobile), bottom border `1px var(--border)`
- **Section head:** 3-column grid at ≥900px: `120px 1fr 1fr` with 32px gap
  - **Col 1 — Section number:** `§ 01 — SAMPLE` in mono 11px UC `text-3`, 1px border-top in `text`, padding-top 8px, width 88px
  - **Col 2 — h2:** "One real audit, redacted. The kind you'd actually pay for." Italicized fragment in `accent` color (use `<em>` with `font-style: normal`).
  - **Col 3 — deck:** Body 16px, color `text-2`, max-width 50ch
- **Body — 2-column** (`.95fr 1.05fr`, gap 64px at ≥1000px):
  - **Left:** Narrative column — h3 ("The grade is the headline. Everything else is evidence."), paragraph, pulled quote with 2px left border in `accent` and a `<cite>` line, second paragraph, two buttons ("Run yours" primary, "View full PDF →" ghost).
  - **Right:** Full audit report card — see [Component: Audit Report Card](#component-audit-report-card).

### 4. § 02 — Why Extension (`<section id="how">`)

- **Section head:** Same 3-column pattern. Headline: "Why a Chrome extension, and not 'just ask ChatGPT.'" The phrase in single-quotes wrapped in `<em>` colored `accent`.
- **Body — 3-column tri-grid:**
  - Wrapper: `display: grid; grid-template-columns: repeat(3, 1fr); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border);`
  - Below 900px, stacks to single column with horizontal dividers between
  - Each column padded `40px 32px 48px`, separated by 1px vertical rules at ≥900px (`border-left: 1px solid var(--border)`)
  - Each column has:
    1. Number eyebrow ("01 / VISIBILITY", "02 / RUBRIC", "03 / SPEED") — mono 11px UC, color `accent`
    2. h3 — 22px, weight 500, tracking `-0.02em`, line-height 1.2
    3. Body p — 14.5px, `text-2`, max-width 38ch
    4. Diagnostic visual — different per column:
       - **Col 1:** 2-up comparison cards — "ChatGPT, paste" / "linkedingrade" with values "~18 fields" (in `accent`) and "147 fields" (in `success`)
       - **Col 2:** Mono rubric list — six rows showing weight percentages ("Headline 14%", "About 22%", etc.)
       - **Col 3:** Giant 42px mono "31s" with the `31` colored `accent`, with "vs. ChatGPT paste-and-pray" line below and a struck-through "~ 6 min"

### 5. § 03 — Built For (`<section id="audiences">`)

- **Section head:** Same. Headline: "Built for people who'd rather be told *specifically*."
- **Body — Audience rows** (not cards):
  - Each row: 4-column grid at ≥900px (`96px 1fr 1fr 220px`, gap 40px), 1px border-top per row, padding `48px 0`
  - **Col 1 — Index:** Roman numeral + persona label, mono 11px UC. The Roman numeral ("I.", "II.", "III.") in `accent`.
  - **Col 2 — Headline:** `who` line in mono 13.5px UC `text-3`, then h3 26px weight 500 tracking `-0.02em`
  - **Col 3 — Paragraph:** Body 15px `text-2`, max-width 44ch
  - **Col 4 — Stats stack:** Three mono rows each 11.5px, 1px border-top, padding-top 8px. Label on left in `text-2`, value on right in `text` weight 500. Example values: "11 / 14", "C+ → B+", "−$300/hr"
- **Three audience rows:**
  1. **SEEKER** — "Mid-to-senior · $100k+ roles" — "Reverse-engineer the profiles you compete with."
  2. **COACH** — "Career coach · solo & boutique" — "White-label deliverables in minutes, not hours."
  3. **SOURCER** — "Recruiter · BD · founder · sales" — "Pre-call signal quality, at the rate of your inbox."

### 6. § 04 — Pricing (`<section id="pricing">`)

- **Section head:** Same. Headline: "Four prices. *One product.* Cancel in two clicks."
- **Body — 4-column grid** at ≥1100px (2-col at 700–1100px, 1-col below). Bordered top + bottom, no gap (cards share borders via `border-left`).
- **Each column** (`.price`):
  - Padding 28px 26px, displays as flex column with gap 18px
  - **Tier label** (`.tier`): "Tier 00 · Free", mono 11px UC `text-3`
  - **h3:** Tier name — 24px weight 500
  - **Amount:** baseline-aligned flex — "$0" at 44px tracking `-0.04em` weight 500, then "/ one-time" in mono 12px `text-3`
  - **Blurb:** 13.5px `text-2`, min-height 42px (keeps alignment when text wraps differently)
  - **Feature list:** 1px border-top, padding-top 16px, gap 8px. Each `<li>` uses a `::before` of "+" in mono `text-3` (or "−" for excluded features via `<li class="x">`). Bold the key noun.
  - **CTA:** at the bottom (margin-top: auto), full-width button
- **The featured tier** (`.price.featured`):
  - Background `var(--surface)` instead of `var(--bg)`
  - "RECOMMENDED" pseudo-element in `::before` — mono 10px UC, accent red background, white text, anchored top-right
- **Four tiers:**
  1. **Tier 00 · Free** — $0/one-time, "Single audit", ghost button "Install free"
  2. **Tier 01 · Pro** ★ FEATURED — $19/month, "Pro", primary button "Start Pro"
  3. **Tier 02 · Coach** — $49/month, "Coach", ghost button "Start Coach"
  4. **Tier 03 · Team** — $149/month, "Team", ghost button "Talk to sales"

(See `Landing Page.html` for exact feature lists per tier — these are copy-locked.)

### 7. § 05 — Final CTA (`<section class="cta-final" id="cta">`)

- **Padding:** 96px vertical (72 mobile)
- **Background:** `var(--surface)` (lifts off the page bg)
- **Layout:** 2-column at ≥900px (`1.2fr .8fr`, gap 64px, align-items: end)
- **Left column:**
  - Meta line: 1px border-top in `text`, padding-top 12px, mono 11px UC `text-3` flex with space-between: "§ 05 — ACTION" / "30 SECONDS · CHROME / EDGE · FREE"
  - h2: "Find out what your profile is *actually* worth." `clamp(40px, 6vw, 76px)`, line-height 0.98, weight 500, tracking `-0.035em`. Italicized word in `accent`.
  - Lede 17px `text-2` max-width 42ch
- **Right column:** Same form treatment as the hero, with button label "Install & audit →"

### 8. Footer (`<footer>`)

- **Padding:** 64px top / 56px bottom
- **Layout:** 4-column grid at ≥700px (`2fr 1fr 1fr 1fr`, gap 32px)
- **Col 1 — Brand:**
  - Stamp 22×22 SVG + wordmark
  - Paragraph: "The honest LinkedIn audit. 30-second Chrome extension, 6-page report, real letter grade. Independent and not affiliated with LinkedIn Corp." — 13.5px `text-2`, max-width 34ch
- **Cols 2–4:** Section title in mono 10.5px UC `text-3`, then `<ul>` of anchor links — 14px `text-2`, hover `text`. Sections: Product, Use cases, Company
- **Meta line below:** 1px border-top, padding-top 18px, flex space-between, mono 11px UC `text-3`. Three items: "© 2026 LINKEDINGRADE INC." / "SET IN GEIST & GEIST MONO" / "VOL. 01 · NO. 12"

---

## Components

### Component: Buttons

```css
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  font-weight: 500; font-size: 14px;
  padding: 10px 16px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  line-height: 1;
  transition: transform .08s ease, background .15s, border-color .15s, color .15s;
}
.btn:hover { transform: translateY(-1px); }

.btn-primary { background: var(--text); color: var(--bg); }
.btn-primary:hover { background: var(--accent); color: #fff; }

.btn-ghost { border-color: var(--border-2); color: var(--text); }
.btn-ghost:hover { background: var(--surface-sub); }

.btn-lg { padding: 14px 20px; font-size: 15px; }
```

The hover-flip of the primary button from `text` → `accent` is **deliberate** — it's the only place red shows up as a fill on the whole page, and only on intent.

### Component: Audit Preview Card

The card on the right side of the hero. Width fills its column. Composition:

1. **Header** (padding 14px 18px, bg `surface-sub`, 1px border-bottom):
   - Left: "AUDIT · LIVE" — mono 11px UC `text-3`
   - Right: "scanning" with a pulsing 6×6 red dot — mono 11px UC `accent`. Animation: `pulse 1.6s infinite` opacity 1 → 0.35 → 1
2. **Body** (padding 22px, grid `148px 1fr` gap 22px, align-items center):
   - **Left — Score donut** (148×148 SVG):
     - Background ring: `circle r=62 stroke=var(--border) stroke-width=10`
     - Progress ring: same circle, `stroke=var(--text)`, `stroke-dasharray=389.557 stroke-dashoffset=105.18` (= 73% filled), rotated -90deg
     - Centered: "B" at 64px weight 500 tracking -0.05em, "−" at 28px in `accent` as `<sup>`
     - Below the letter: "73 / 100" in mono 11px UC `text-3`
   - **Right — Subject:**
     - Name: "Subject · anonymized" — 15px weight 500
     - Role: "VP, Engineering · top-3 US bank" — 13px `text-2`
     - Tag chips: "10y exp", "NYC", "CMU '15", "photo dated" (last one warning-styled with `accent` border)
       - Each chip: mono 10.5px UC, padding 3px 7px, 1px border `border-2`, radius `--r-sm`
3. **Rows section:** 6 rows, each 1px border-top, padding 10px 22px, grid `130px 1fr 60px` gap 14px:
   - Mono label (11px UC `text-2`)
   - Bar: 6px tall, bg `surface-sub`, radius 2px, inner fill bar with width = score %. Color per grade band: `text` (default), `warning`, `accent` (bad), `success` (good)
   - Grade letter: mono 14px weight 500, right-aligned, color-coded same as bar
   - Six rows: Headline B+ (84%, good), About C (58%, warn), Experience B (76%), Skills A− (90%, good), Activity D (34%, bad), Photo B+ (78%)
4. **Footer** (padding 14px 22px, bg `surface-sub`, 1px border-top, flex space-between, mono 11px UC `text-3`):
   - "RECRUITER SIGNAL · **73 / 100**" / "RUN **014,289**"

### Component: Audit Report Card

The larger card in § 01. Same family as the preview but more dense:

- **Header:** "**RUN 014,289** · 13 MAY 2026 · 14:02 ET" on left, "REDACTED · SAMPLE" badge on right (bordered chip)
- **Body — 2-column grid** `200px 1fr` (single column below 700px):
  - **Left — Grade column** (padding 22px, bg `surface-sub`, 1px right-border):
    - "Composite" label mono UC
    - "B" at **120px** with "−" at **42px** in `accent` as `<sup>`
    - "73 / 100 · P64" in mono 12px `text-2`
  - **Right — Rows:** Six `r-row`s, each grid `1fr 90px`:
    - Left: section name (14px weight 500) over description (12.5px `text-3`)
    - Right: grade letter mono **22px** weight 500, right-aligned, color-coded
- **Footer — 2-column grid** (padding 16px 22px, bg `surface-sub`, 1px top border, gap 24px):
  - **Top wins:** h4 mono UC label, `<ul class="wins">` — each `<li>` has `::before: "→"` in `success`
  - **Highest-leverage fixes:** h4, `<ul class="fixes">` — each `<li>` has `::before: "→"` in `accent`

(Exact copy for the lists is in `Landing Page.html`.)

---

## Interactions & Behavior

- **Theme toggle:** Click `.theme-toggle` button → flips `[data-theme]` between `"dark"` and `"light"` on `<html>` and persists to `localStorage.lig-theme`. Initial state respects `prefers-color-scheme` if no stored value. The CSS uses both `@media (prefers-color-scheme: dark)` and `:root[data-theme="..."]` selectors so manual override beats system pref.
- **Sticky nav:** Position sticky, top 0, backdrop blur. No transformation on scroll.
- **Email forms:** All two forms call `event.preventDefault()` in the prototype. Wire to your real signup flow / Chrome Web Store install URL.
- **Primary button hover:** Background flips `text` → `accent`, color flips `bg` → `#fff`. 150ms transition. Also translates up 1px (80ms).
- **Live pulse dot** on the audit preview card: keyframes opacity 1 → 0.35 → 1, 1.6s infinite.
- **No other animations.** No scroll-triggered fades, no parallax. Page should be readable in <90s with no motion budget.

---

## Responsive Behavior

**Mobile-first**, every section must work at 375px wide.

Breakpoints used:
- `≥700px` — pricing grid 2-col, footer 4-col, report-grid horizontal
- `≥900px` — nav links visible, audience rows go 4-col, tri-grid horizontal, section-head 3-col
- `≥1000px` — hero 2-col, feature-audit 2-col
- `≥1100px` — pricing grid 4-col

At 375px, the hero meta-rule items wrap; the audit preview card stacks to single column inside itself.

---

## Accessibility

- Every interactive element must be keyboard-reachable.
- Min text contrast: WCAG AA (4.5:1 for body, 3:1 for large text). The token pairs above are pre-validated.
- The score donut and bar charts in the audit card include `role="img"` and `aria-label` attributes describing the grade in words.
- Buttons get accessible labels even when only an icon is shown.
- Theme toggle has `aria-label="Toggle theme"`.

---

## SEO / Meta

In the `<head>`:
- `<title>LinkedInGrade — the honest LinkedIn audit</title>`
- `<meta name="description" content="A 30-second Chrome extension audits any LinkedIn profile and returns a 6-page report. Letter grade, recruiter heat map, before/after rewrites, priority action plan.">`
- OG image: 1200×630, dark background, see § 04 in `LinkedInGrade Identity.html` (and the OG card mockup inside it). This is the highest-leverage launch asset — render server-side from the design or commission Midjourney from the prompt in the brand book.
- Favicon: `<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">`
- Apple touch icon: 180×180 PNG export of `favicon.svg`

---

## Implementation Recommendations

**Stack:** Next.js 14 (App Router) + Tailwind CSS. Map `tokens.css` values into `tailwind.config.js`'s `theme.extend.colors` / `spacing` / `borderRadius` / `fontFamily`. Use server components for everything except the theme toggle (which can be a tiny client component).

**Performance budget:** Lighthouse > 95 on all four axes. The page has zero images (all visual content is SVG or text), no client-side font swap (use `font-display: swap` + preconnect), and no JS beyond the theme toggle. Should easily clear 95 with cold cache.

**Don't:**
- Don't substitute a different font for Geist. The wordmark depends on it.
- Don't add stock photography. The brief explicitly forbids it; the audit card itself is the hero visual.
- Don't soften the corners on the audit card or report card. 14px radius is the system maximum.
- Don't introduce additional accent colors. Three colors (navy, white, red) + neutrals. Period.

---

## Questions or Edits?

When something in the design feels ambiguous, default to the **HTML reference file** as the canonical source — it has been hand-tuned and the spacing/sizing values there are intentional. If a token in `tokens.css` and a value in the HTML disagree, the HTML wins; please flag the discrepancy back to the designer.

Designer is reachable at the source-of-truth Chat for follow-ups. Good luck.
