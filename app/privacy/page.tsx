import type { Metadata } from "next";

import TextPage from "../components/TextPage";

const LAST_UPDATED = "May 2026";

export const metadata: Metadata = {
  title: "Privacy Policy — LinkedInGrade",
  description:
    "What LinkedInGrade collects, why, and how to ask for your data back. Plain language.",
};

export default function PrivacyPage() {
  return (
    <TextPage
      sectionNum="§ A — PRIVACY"
      eyebrow="PRE-LAUNCH · WAITLIST SITE"
      title={
        <>
          What we collect, in <em>plain English.</em>
        </>
      }
      deck="LinkedInGrade is a Chrome extension still in development. Until it launches, this site exists to share what we're building and to collect waitlist sign-ups. Here's exactly what that involves."
      updated={LAST_UPDATED}
    >
      <h2>What this site collects today</h2>
      <p>
        This site has two surfaces that touch your data: the marketing page
        with its <b>waitlist form</b> (your email), and the{' '}
        <a href="/audit">/audit page</a> (your uploaded LinkedIn PDF and,
        optionally, your email). The details for each are below.
      </p>
      <p>
        We also use <b>Vercel Analytics</b> to measure basic, aggregated traffic
        — page views, country-level location, referrer. It does not set
        advertising cookies and does not build a profile of you across other
        sites.
      </p>

      <h2>The waitlist email</h2>
      <p>
        Email addresses submitted through the waitlist form are used for one
        thing: to email you about LinkedInGrade — when the extension launches,
        how to install it, and occasional updates about the product. No
        newsletters about unrelated topics. No selling your address.
      </p>
      <p>
        Waitlist emails are stored and sent via <b>Kit</b> (kit.com, the email
        service formerly known as ConvertKit). For waitlist sign-ups, Kit is
        the only third party that receives your email — they don&apos;t flow
        through the audit-flow processors described below.
      </p>
      <p>
        That&apos;s the full list for the waitlist flow. We do not sell email
        addresses. We do not share them with advertisers, data brokers, or any
        other party.
      </p>

      <h2>The /audit page on this site</h2>
      <p>
        This site also hosts <a href="/audit">linkedingrade.com/audit</a> — a
        web-based audit you can run by uploading the PDF your LinkedIn profile
        produces from <b>More → Save to PDF</b>. The flow is different from a
        page view, so here&apos;s the full picture:
      </p>
      <ul>
        <li>
          When you upload a PDF, we parse it on the server, run our scoring
          engine, and store <b>the parsed text contents of the PDF</b> (the
          structured profile fields), the resulting <b>audit report</b>, and a
          server-side <b>audit ID</b> for up to 90 days. The PDF file itself is
          not retained — we read it once and discard the bytes.
        </li>
        <li>
          If you submit your email to see the full report, we store that{' '}
          <b>email</b> on the audit record so we can send you the report and a
          link back to it. We also store the <b>browser user-agent</b> string,
          and a one-way <b>SHA-256 hash of your IP</b> (peppered with a server
          secret). We never store your raw IP.
        </li>
        <li>
          If you fill in the optional self-assessed checklist (photo, banner,
          activity, recommendations, featured), those answers are saved on the
          same audit record and contribute{' '}
          <b>up to 15% of the composite, capped</b> — and only ever upward.
          A poor self-report can never lower the composite below the parser-
          verified baseline. They are not used for analytics or marketing.
        </li>
        <li>
          Two third parties receive audit-flow data in production:{' '}
          <b>Resend</b> (resend.com), which sends the transactional email,
          and <b>Vercel KV</b> backed by <b>Upstash</b> (upstash.com), which
          stores the audit record — including the email association — under
          a 90-day expiry. No other third parties are involved.
        </li>
        <li>
          The 90-day expiry on the stored record is enforced by Upstash via
          Redis TTL. After 90 days the record — and your email&apos;s
          association with it — are deleted automatically. If the site is
          ever run without KV provisioned, the in-memory fallback applies the
          same 90-day window before evicting a record on read.
        </li>
        <li>
          You can ask us to delete your audit and email association at any
          time by emailing{' '}
          <a href="mailto:hello@linkedingrade.com">
            hello@linkedingrade.com
          </a>{' '}
          with your audit ID (visible in the result-page URL) or the email you
          used.
        </li>
      </ul>
      {/* LEGAL-REVIEW: confirm the 90-day retention is the right window for the
          /audit feature once usage data exists; align with extension retention
          once that side of the product ships. */}

      <h2>The Chrome extension (when it launches)</h2>
      <p>
        The extension itself is not available yet. When it ships, it will come
        with its own detailed privacy policy describing how audit data is
        handled. The short version of what we&apos;re building:
      </p>
      <ul>
        <li>
          The extension reads the public LinkedIn profile page you choose to
          audit, in your browser.
        </li>
        <li>
          That profile data is processed <b>in-memory</b> to generate your
          report. It is not stored on our servers as a long-lived record of the
          audited profile, and it is not sold to anyone.
        </li>
        <li>
          You stay in control of which profiles you audit. The extension does
          not run in the background or scrape LinkedIn on its own.
        </li>
      </ul>
      {/* LEGAL-REVIEW: confirm exact data-retention language for the extension once the architecture is finalized; this should mirror PRIVACY.md in the extension repo. */}

      <h2>Cookies</h2>
      <p>
        This site uses cookies and local storage for two things only: remembering
        your theme preference (light or dark), and the anonymous analytics
        described above. No advertising trackers, no cross-site profiling.
      </p>

      <h2>Your rights</h2>
      <p>
        You can ask us to:
      </p>
      <ul>
        <li>Tell you what waitlist data we hold about you.</li>
        <li>Delete your email from the waitlist.</li>
        <li>Correct an address if you typed it wrong.</li>
      </ul>
      <p>
        Email <a href="mailto:hello@linkedingrade.com">hello@linkedingrade.com</a>{" "}
        and we&apos;ll handle it. There&apos;s no form to fill out.
      </p>
      {/* LEGAL-REVIEW: once a real legal entity exists, a lawyer should confirm whether this section needs to formally cite GDPR / CCPA / UK-GDPR rights by name, and whether a representative or DPO needs to be listed. */}

      <h2>Children</h2>
      <p>
        LinkedInGrade is built for working adults using LinkedIn. The waitlist
        is not directed at children under 16, and we don&apos;t knowingly
        collect their information.
      </p>

      <h2>Changes</h2>
      <p>
        When this policy changes, we&apos;ll update the date at the top. If a
        change is material — for example, a new processor — waitlist subscribers
        will get an email about it.
      </p>

      <h2>Who runs LinkedInGrade</h2>
      <p>
        LinkedInGrade is built by an independent operator, not a company you
        can look up in a registry yet. It is not affiliated with, endorsed by,
        or connected to LinkedIn Corporation or Microsoft. Questions, requests,
        or concerns: <a href="mailto:hello@linkedingrade.com">hello@linkedingrade.com</a>.
      </p>
      {/* LEGAL-REVIEW: once a legal entity (LLC / Ltd) is formed, replace this paragraph with the entity name, registered address, and any required regulator contact details. */}

      <div className="text-page-note">
        Honest framing: LinkedInGrade is pre-launch and operated by an
        individual. We aim to handle data the way we&apos;d want ours handled.
        If something here is unclear or you think we got it wrong, tell us — we
        will fix it.
      </div>
    </TextPage>
  );
}
