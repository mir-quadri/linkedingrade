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
