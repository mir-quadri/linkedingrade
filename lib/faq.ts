import { EXTENSION_COMING_SOON } from '@/lib/copy';

/**
 * Single source of truth for the /audit FAQ. Rendered as HTML by
 * `AuditFaq` AND serialized as FAQPage JSON-LD by `faqPageJsonLd`, so the
 * visible copy and the structured data cannot drift.
 *
 * Every answer must stay true to the code and /privacy:
 *   - weights: lib/engine/scoring/weights.ts (PDF mode, 25% each)
 *   - retention: lib/storage/auditStore.ts (90-day TTL; PDF bytes discarded)
 *   - email use: app/api/audit/email (Brevo transactional only; never Kit)
 *   - masked share-link email: lib/audit/maskEmail.ts
 *   - judge: lib/judge (Headline + About; time-capped; structural fallback).
 *     Anthropic receives only Headline/About text + rolesFamilyHint
 *     (judgeRequestSchema.ts → buildPrompt.ts) — keep /privacy in sync.
 * No SOC 2, no paid-plan-live, no dated launch, no invented stats.
 */
export interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

export const AUDIT_FAQ: readonly FaqItem[] = [
  {
    id: 'what-it-grades',
    question: 'What does LinkedInGrade grade?',
    answer:
      'The free audit grades the 4 sections recruiters scan first: Headline, About, Current Experience (your current role), and Career Arc (your experience history). Each is worth 25% of your composite letter grade. Sections a PDF export can’t show well, like photo, banner, and activity, aren’t graded here.',
  },
  {
    id: 'export-pdf',
    question: 'How do I export my LinkedIn profile as a PDF?',
    answer:
      'On LinkedIn in a desktop browser, open your own profile, click “More” (in some layouts it’s “Resources”), then choose “Save to PDF”. Upload the file LinkedIn downloads (up to 4 MB). LinkedIn changes its menus from time to time, so the button may be labelled or placed a little differently.',
  },
  {
    id: 'is-it-free',
    question: 'Is it free?',
    answer:
      'Yes. The 4-section PDF audit is free, with no account and no card. Fair-use rate limits apply to the AI review. There are no paid plans available today.',
  },
  {
    id: 'pdf-and-email',
    question: 'What happens to my PDF and email?',
    answer:
      'We parse your PDF on our server and discard the file itself. The parsed profile fields and your audit report are stored for up to 90 days, then deleted automatically. When the AI review is enabled, only your Headline and About text (plus a coarse role label) is sent to Anthropic to evaluate it. If you enter your email to unlock the full report, it’s used to send you that report and a link back to it — it isn’t added to any marketing list unless you separately join the extension waitlist. The shareable result link shows only a masked version of your email. To delete your audit sooner, email hello@linkedingrade.com with your audit ID or the email you used. Our privacy policy has the full details.',
  },
  {
    id: 'how-long',
    question: 'How long does it take?',
    answer:
      'Usually under a minute. Parsing and structural scoring are quick; the AI review of your Headline and About adds a little time and is time-capped, so a slow review can’t hold up your grade.',
  },
  {
    id: 'extension',
    question: 'Is the Chrome extension available?',
    answer: `Not yet. ${EXTENSION_COMING_SOON} It isn’t on the Chrome Web Store; join the waitlist on the homepage and we’ll email you when it ships.`,
  },
  {
    id: 'how-scoring-works',
    question: 'How does scoring work?',
    answer:
      'Each section first gets a structural score from rules applied to your PDF text — things like length, mobile truncation, buzzwords and clichés, and seniority signals. When the AI judge is available, it adds a qualitative review of your Headline and About and suggests rewrites grounded in your own profile. If it isn’t, those sections show a structural-only grade marked for review. The 4 section scores combine at 25% each into your composite grade.',
  },
];
