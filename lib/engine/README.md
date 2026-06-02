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

## Scoring modes

`runScoring(profile, judgeResponse, mode)` takes a `mode`:

- `'full'` (default) — the 12-section audit. This is the Chrome extension's
  surface; the composite is the weighted average of all 12 sections.
- `'pdf'` — the focused 4-section "Sample Audit" the website's PDF flow
  ships. `runPdfAudit(profile)` is the entry point. The `sections` array
  still carries all 12 entries (the other 8 are parsed and returned for
  reference) but the composite, top wins and highest-leverage fixes are
  computed from the 4 graded sections only — **Headline, About, Current
  Experience, Career Arc** (`experienceHistory`), each at **25%** weight.

The two engines now **intentionally differ**: the PDF audit is calibrated
against the sections recruiters scan first, not against the extension's full
rubric. This divergence is deliberate and is NOT a sync-debt item.

## Calibration policies

- **Structural grades are floors; AI judgments lift but never drop.** A
  section scored with structural signals only (`needsReview: true`, the `*`
  marker in the UI) is capped at the **B+ band** (`B_PLUS_CEILING`, adjusted
  score 89). Structural cues cannot honestly tell A-grade originality from
  clever cliché-stuffing, so structural-only sections never read above B+.
  When the AI judge (B3) ships it may lift a B+ to an A on qualitative
  review; it never drops a structural grade below its structural floor.

- **Asymmetric tier modifier.** The per-section seniority modifier is banded
  by the section's raw score so excellence is never penalised for being
  senior (and strong early-career work is rewarded). See `bandedTierModifier`.

- **Cliché-opener cap.** The About cliché-opener penalty is capped at -5 raw
  (`CLICHE_OPENER_PENALTY`) — real feedback, but it shouldn't single-handedly
  tank a substantive About on a 25%-weighted section.

- **Headline structural model.** The headline raw score is additive
  (base 50 + length + pipes + power words + keyword density) rather than a
  flat 70 floor, so headline quality differentiates. Structural signals alone
  cap at the B+ band.

## Sync rules

Do NOT modify the *full-audit* scoring logic, rubric weights, or seniority
logic in ways that should sync back to the extension without back-porting.
The PDF-mode behaviour and the calibration policies above are website-only
and intentionally diverge from the extension.

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
