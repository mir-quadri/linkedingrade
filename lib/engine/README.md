# Audit Engine

Copied from [linkedingrade-extension](https://github.com/mir-quadri/linkedingrade-extension).
Source of truth is currently the extension repo — keep in sync manually
until extracted to a shared package.

## Layout

- `types/` — `ProfileData`, `AuditResult`, `Judge*` interfaces, and the
  `SectionId` enum. These are the engine's public contract.
- `scoring/` — pure scoring engine. `runScoring(profile, judgeResponse)`
  consumes a `ProfileData` (extracted from a LinkedIn profile by the
  extension's DOM scraper or this repo's PDF parser) and a `JudgeResponse`
  (the AI layer's qualitative judgments) and returns an `AuditResult`.

The engine is intentionally pure — it knows weights, thresholds and
structural signals only. Anything needing real language judgment lives
behind the `Judge` interface so it can be stubbed in tests and degraded
gracefully when the AI proxy is unavailable.

## Sync rules

Do NOT modify scoring logic, rubric weights, or seniority logic in this
copy. If a bug needs fixing, fix it in the extension repo first, then
copy the change here. The only local edits permitted are import-path
adjustments so the code compiles under this repo's `@/*` alias.

## Known divergences from the extension

These are intentional, isolated fixes applied here ahead of the next
extension→website sync. Each must be back-ported to
`linkedingrade-extension` and removed from this list.

- Conditional `slice(1)` on `experienceHistory.data` — three callsites
  inside the engine assume `history[0]` is the current role, which is
  wrong when the PDF parser correctly surfaces a between-jobs profile
  with `currentExperience.data = null`. Each callsite now keeps
  `history[0]` when there's no current role and otherwise drops it as
  before. Look for the `SYNC-DIVERGENCE` comments in:
  - `scoring/sections/experienceHistory.ts` (full-history score)
  - `scoring/index.ts` — `buildJudgeRequest` and `expectedJudgeKeys`
    (AI judge `fullText` + judge-coverage accounting)
  - `scoring/sections/keywordHealth.ts` — `collectText` (buzzword /
    keyword scan)
