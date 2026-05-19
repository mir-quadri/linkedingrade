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

- `scoring/sections/experienceHistory.ts` — `past = entries.slice(1)`
  is now guarded on `currentExperience.data` being non-null. Without
  the guard, the website's PDF parser correctly reports a between-jobs
  profile as having no current role, but the unconditional `slice(1)`
  drops the most-recent past role from the history score, silently
  excluding the user's strongest evidence. The conditional restores
  the intended behaviour. Look for the `SYNC-DIVERGENCE` comment in
  the file.
