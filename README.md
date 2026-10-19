# LinkedInGrade

**Free LinkedIn profile audit from your PDF export → [linkedingrade.com/audit](https://linkedingrade.com/audit)**

Save your LinkedIn profile as a PDF (LinkedIn → your profile → **More** → **Save to PDF**), drop it on
[linkedingrade.com/audit](https://linkedingrade.com/audit), and get an honest letter grade on the
4 sections recruiters scan first:

| Section            | Weight |
| ------------------ | ------ |
| Headline           | 25%    |
| About              | 25%    |
| Current Experience | 25%    |
| Career Arc         | 25%    |

The free audit is the live product today. A Chrome extension that grades the full live profile
(12 sections, including signals a PDF export can't show, such as activity and photo) is **coming
soon** — it is not on the Chrome Web Store yet. You can join the waitlist at
[linkedingrade.com](https://linkedingrade.com/#cta). Paid plans are not available yet.

This repo is the public site at [linkedingrade.com](https://linkedingrade.com): the marketing
pages, the `/audit` flow, and its API routes. Built with Next.js 15 (App Router), React 19,
TypeScript, and Tailwind CSS 4; deployed on Vercel.

Independent project — not affiliated with LinkedIn Corp.

## How the audit works

1. `app/audit` — upload UI (`app/components/audit/AuditFlow.tsx`); PDFs are capped at 4 MB.
2. `POST /api/audit` (`app/api/audit/route.ts`, Node runtime) — parses the PDF
   (`lib/pdf/parseLinkedInPdf.ts`, via `pdf-parse`), scores it with the shared engine
   (`lib/engine`, copied from the extension), and optionally asks the server-side AI judge
   (`/api/judge`) for qualitative review. If the judge isn't configured, sections get a
   structural-only grade marked as pending review.
3. The result is stored (`lib/storage/auditStore.ts`) and shown at `/audit/result/[auditId]`; an optional
   email copy is sent via Brevo (`lib/email`).

Other routes: `/api/waitlist` (Kit), `/api/extension-judge` (secretless relay for the upcoming
extension), `/api/audit/email`, `/api/audit/self-report`, `/api/audit/diag`.

## Local development

```bash
npm ci
cp .env.example .env.local   # fill in what you need; see below
npm run dev                  # http://localhost:3000
```

| Script               | What it does                                     |
| -------------------- | ------------------------------------------------ |
| `npm run dev`        | Next.js dev server                               |
| `npm run build`      | Production build                                 |
| `npm start`          | Serve the production build                       |
| `npm run typecheck`  | `tsc --noEmit`                                   |
| `npm run lint`       | ESLint (flat config, `eslint-config-next`)       |
| `npm test`           | Vitest, single run (`npm run test:watch` to watch) |
| `npm run build:og`   | Regenerate `public/og.png` (`scripts/build-og.mjs`) |

Parser helpers:

- `node scripts/make-test-profile-pdf.mjs` writes a synthetic `./Profile.pdf` (gitignored) for
  exercising the upload flow end-to-end.
- `npx tsx smoke-test-pdf.ts` runs the parser against `./Profile.pdf` if present, otherwise
  against embedded verbatim text. (`tsx` isn't a dependency; `npx` fetches it.)

## Environment variables

Copy `.env.example` to `.env.local`. **`npm run dev` and the `/audit` flow run with none of them set**; each
feature degrades as noted below. `.env.example` has the full notes; summary:

| Variable(s)                                                                 | Used by                     | When unset                                                     |
| --------------------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `KIT_API_KEY`, `KIT_FORM_ID`                                                | `/api/waitlist` (Kit V4)    | `/api/waitlist` returns a 500 config error                     |
| `BREVO_API_KEY`, `EMAIL_FROM`                                               | Audit email (Brevo)         | Report still renders; no email sent                            |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN`                                      | Audit storage, rate limits  | Per-instance in-memory store (lost on cold start)              |
| `IP_HASH_PEPPER`                                                            | Peppered SHA-256 IP hashes (audit records, rate-limit keys) | IP hashing is disabled (`hashIp` returns `null`; see `lib/audit/hashIp.ts`) |
| `ANTHROPIC_API_KEY`, `JUDGE_MODEL`, `JUDGE_MAX_OUTPUT_TOKENS`, `JUDGE_RATE_LIMIT_PER_DAY`, `JUDGE_PRICE_INPUT_USD_PER_MILLION`, `JUDGE_PRICE_OUTPUT_USD_PER_MILLION` | `/api/judge` AI judge | No key → `judge_unavailable`; tuning vars fall back to defaults (see `.env.example`) |
| `JUDGE_PROXY_SECRET`, `JUDGE_ALLOWED_ORIGINS`, `JUDGE_PROXY_URL`            | Judge auth (`X-Judge-Auth`), CORS, proxy URL | No secret → audits run structural-only; `JUDGE_PROXY_URL` defaults to same-origin `/api/judge` |
| `EXTENSION_JUDGE_ALLOWED_ORIGINS`, `EXTENSION_JUDGE_RATE_LIMIT_PER_DAY`     | `/api/extension-judge`      | Defaults to the published extension id / 50 per day            |

Treat keys and secrets as secrets; never commit `.env.local`. In production, set them on the
Vercel project (Settings → Environment Variables) for `Production` and `Preview`.

## Repo layout

- `app/` — routes, pages, and components (`app/components`, `app/components/audit`)
- `lib/` — PDF parser (`lib/pdf`), scoring engine (`lib/engine`), judge, storage, email, shared
  copy (`lib/copy.ts`)
- `design/` — original design mocks and brand references (not shipped; may predate current copy)
- `public/` — static assets served by the site
