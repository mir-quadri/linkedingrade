import Link from "next/link";

import { WAITLIST_CTA, EXTENSION_COMING_SOON, AUDIT_CTA } from "@/lib/copy";

import AuditPreviewCard from "./components/AuditPreviewCard";
import AuditReportCard from "./components/AuditReportCard";
import PricingTier, { type Feature } from "./components/PricingTier";
import SiteFooter from "./components/SiteFooter";
import SiteNav from "./components/SiteNav";
import WaitlistForm from "./components/WaitlistForm";

export default function Page() {
  return (
    <>
      <SiteNav />
      <Hero />
      <SampleAudit />
      <WhyExtension />
      <BuiltFor />
      <Pricing />
      <FinalCTA />
      <SiteFooter />
    </>
  );
}

function Hero() {
  return (
    <header className="hero">
      <div className="container-x">
        <div className="hero-meta">
          <span>
            <strong>VOL. 01</strong>&nbsp;&nbsp;NO. 01
          </span>
          <span>LAUNCH ISSUE · 2026</span>
          <span>THE PROFILE, GRADED</span>
        </div>
        <div className="hero-grid">
          <div>
            <h1>
              Every LinkedIn profile
              <br />
              gets a grade<em>.</em>
            </h1>
            <p className="lede">
              A 30-second Chrome extension — <b>coming soon</b> — will audit any
              profile and return a 6-page report: letter grade A through F,
              recruiter heat map, before/after rewrites, and a priority action
              plan. Today, drop your profile PDF for an honest grade on the{" "}
              <b>4 sections recruiters scan first.</b> No hedging, no horoscopes.
              Brutal where it matters, specific everywhere.
            </p>

            <WaitlistForm
              buttonLabel={WAITLIST_CTA}
              fineprint={[
                "We email you at launch",
                "Chrome & Edge",
                "SOC 2 in progress",
              ]}
            />

            <p
              style={{
                margin: "10px 0 0",
                fontSize: 13.5,
                color: "var(--text-2)",
              }}
            >
              Want a grade today?{" "}
              <Link
                href="/audit"
                style={{
                  color: "var(--text)",
                  borderBottom: "1px solid var(--border-2)",
                }}
              >
                {AUDIT_CTA}
              </Link>
            </p>

            <div className="proof-strip">
              <div className="proof-cell">
                <span className="num">
                  31<span style={{ color: "var(--accent)" }}>s</span>
                </span>
                <span className="lbl">Target median</span>
              </div>
              <div className="proof-cell">
                <span className="num">6</span>
                <span className="lbl">Page report</span>
              </div>
              <div className="proof-cell">
                <span className="num">
                  A<span style={{ color: "var(--accent)" }}>+</span> – F
                </span>
                <span className="lbl">Letter grade</span>
              </div>
              <div className="proof-cell">
                <span className="num">Beta</span>
                <span className="lbl">Q2 · 2026</span>
              </div>
            </div>
          </div>

          <AuditPreviewCard />
        </div>
      </div>
    </header>
  );
}

function SampleAudit() {
  return (
    <section className="s" id="sample">
      <div className="container-x">
        <div className="section-head">
          <div className="section-num">§ 01 — SAMPLE</div>
          <h2>
            One real audit, redacted. The kind you&apos;d{" "}
            <em>actually pay for.</em>
          </h2>
          <p className="deck">
            No screenshots of dashboards we wish existed. This is a sample
            report on a working VP profile, with the name and employer scrubbed.
            The scoring rubric is the same one we&apos;d run on yours.
          </p>
        </div>

        <div className="feature-audit">
          <div
            style={{ display: "flex", flexDirection: "column", gap: 18 }}
          >
            <h3
              style={{
                margin: 0,
                fontSize: 28,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
                fontWeight: 500,
              }}
            >
              The grade is the headline. Everything else is evidence.
            </h3>
            <p
              style={{
                margin: 0,
                color: "var(--text-2)",
                maxWidth: "46ch",
              }}
            >
              Six headline grades. Each composed from a sub-rubric, calibrated
              to the frameworks senior recruiters and hiring managers use. Each
              cross-checked against the population of profiles at the same
              seniority, function, and industry — so a B+ for a senior VP means
              something different than a B+ for a graduate analyst.
            </p>
            <div
              style={{
                borderLeft: "2px solid var(--accent)",
                padding: "6px 0 6px 16px",
                fontSize: 20,
                lineHeight: 1.35,
                letterSpacing: "-0.01em",
                color: "var(--text)",
                margin: "8px 0",
              }}
            >
              &ldquo;The recruiter heat map is what made me pay. I could see
              exactly which two lines a sourcer would stop scrolling on.&rdquo;
              <cite
                className="font-mono"
                style={{
                  display: "block",
                  fontStyle: "normal",
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  marginTop: 8,
                }}
              >
                — Beta user, Series C founder
              </cite>
            </div>
            <p
              style={{
                margin: 0,
                color: "var(--text-2)",
                maxWidth: "46ch",
              }}
            >
              The 6-page PDF includes line-by-line rewrites for the About and
              top three Experience entries, the exact phrasing flagged as
              cliché, and the three highest-leverage fixes ranked by
              minutes-to-implement.
            </p>
            <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
              <Link href="#cta" className="btn btn-primary">
                Run yours
              </Link>
              <Link href="#pricing" className="btn btn-ghost">
                See pricing →
              </Link>
            </div>
          </div>

          <AuditReportCard />
        </div>
      </div>
    </section>
  );
}

function WhyExtension() {
  return (
    <section className="s" id="how">
      <div className="container-x">
        <div className="section-head">
          <div className="section-num">§ 02 — METHOD</div>
          <h2>
            Why a Chrome extension, and not{" "}
            <em>&ldquo;just ask ChatGPT.&rdquo;</em>
          </h2>
          <p className="deck">
            A general-purpose LLM is a brilliant intern with no glasses. It
            can&apos;t see the page, can&apos;t compare you to a population, and
            can&apos;t reproduce its own answer twice. The audit is built around
            the three things ChatGPT can&apos;t do.
          </p>
        </div>

        <div className="tri">
          <div className="tri-col">
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--accent)",
                textTransform: "uppercase",
                marginBottom: 24,
              }}
            >
              01 / VISIBILITY
            </div>
            <h3
              style={{
                fontSize: 22,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                margin: "0 0 12px",
                fontWeight: 500,
                textWrap: "balance",
              }}
            >
              It reads the live page. The actual one.
            </h3>
            <p
              style={{
                color: "var(--text-2)",
                fontSize: 14.5,
                lineHeight: 1.55,
                margin: 0,
                maxWidth: "38ch",
              }}
            >
              Activity history, endorsement freshness, banner-image composition,
              posting cadence, mutual-connection signal — none of which you can
              paste into a chat window without flattening it to text and losing
              the signal.
            </p>
            <div style={{ marginTop: 28 }}>
              <div
                className="font-mono"
                style={{
                  fontSize: 12,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 14,
                }}
              >
                <DiagBox label="ChatGPT, paste" value="~18 fields" tone="bad" />
                <DiagBox label="linkedingrade" value="147 fields" tone="good" />
              </div>
            </div>
          </div>

          <div className="tri-col">
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--accent)",
                textTransform: "uppercase",
                marginBottom: 24,
              }}
            >
              02 / RUBRIC
            </div>
            <h3
              style={{
                fontSize: 22,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                margin: "0 0 12px",
                fontWeight: 500,
                textWrap: "balance",
              }}
            >
              One fixed rubric. Same input, same grade. Always.
            </h3>
            <p
              style={{
                color: "var(--text-2)",
                fontSize: 14.5,
                lineHeight: 1.55,
                margin: 0,
                maxWidth: "38ch",
              }}
            >
              Twelve sections, 38 weighted signals, calibrated to the frameworks
              senior recruiters and hiring managers use. Re-run the same profile
              a year from now and you&apos;ll get a grade that&apos;s directly
              comparable. Ask GPT twice and you&apos;ll get two different
              answers.
            </p>
            <div style={{ marginTop: 28 }}>
              <div
                className="font-mono"
                style={{
                  fontSize: 10.5,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                  marginBottom: 10,
                }}
              >
                Top 6 of 12 sections
              </div>
              <div
                className="font-mono"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  fontSize: 11.5,
                  color: "var(--text-2)",
                }}
              >
                {[
                  ["Headline", "14%"],
                  ["About", "22%"],
                  ["Experience", "28%"],
                  ["Skills", "12%"],
                  ["Activity", "16%"],
                  ["Photo", "08%"],
                ].map(([k, v]) => (
                  <div
                    key={k}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 8,
                      padding: "6px 10px",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    <b
                      style={{
                        fontWeight: 500,
                        color: "var(--text)",
                        letterSpacing: "-0.01em",
                      }}
                    >
                      {k}
                    </b>
                    <span>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="tri-col">
            <div
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.08em",
                color: "var(--accent)",
                textTransform: "uppercase",
                marginBottom: 24,
              }}
            >
              03 / SPEED
            </div>
            <h3
              style={{
                fontSize: 22,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                margin: "0 0 12px",
                fontWeight: 500,
                textWrap: "balance",
              }}
            >
              30 seconds, in-context. No tab, no prompt.
            </h3>
            <p
              style={{
                color: "var(--text-2)",
                fontSize: 14.5,
                lineHeight: 1.55,
                margin: 0,
                maxWidth: "38ch",
              }}
            >
              Once it ships, you&apos;ll pin the extension, hit any profile, and
              click once — a 6-page PDF in your downloads before you&apos;d have
              finished typing the system prompt. Built for the cadence of an
              actual job search or an actual sourcing day.
            </p>
            <div
              className="font-mono"
              style={{
                marginTop: 28,
                display: "flex",
                flexDirection: "column",
                gap: 6,
              }}
            >
              <div
                style={{
                  fontSize: 42,
                  letterSpacing: "-0.04em",
                  color: "var(--text)",
                  fontWeight: 500,
                  lineHeight: 1,
                }}
              >
                <span style={{ color: "var(--accent)" }}>31</span>s
              </div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "var(--text-3)",
                }}
              >
                target median, click to PDF
              </div>
              <div
                style={{
                  marginTop: 16,
                  borderTop: "1px solid var(--border)",
                  paddingTop: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 11.5,
                  color: "var(--text-2)",
                  gap: 12,
                }}
              >
                <span>vs. ChatGPT paste-and-pray</span>
                <s style={{ color: "var(--text-3)", textDecoration: "line-through" }}>
                  ~ 6 min
                </s>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DiagBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const valueColor =
    tone === "good" ? "var(--success)" : tone === "bad" ? "var(--accent)" : "var(--text)";
  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: "var(--r-sm)",
        padding: 12,
      }}
    >
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 18,
          letterSpacing: "-0.02em",
          color: valueColor,
          fontWeight: 500,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function BuiltFor() {
  const rows: {
    idx: string;
    persona: string;
    who: string;
    title: string;
    body: string;
    stats: [string, string][];
  }[] = [
    {
      idx: "I.",
      persona: "SEEKER",
      who: "Mid-to-senior · $100k+ roles",
      title: "Reverse-engineer the profiles you compete with.",
      body:
        "Audit your own profile first — fix it. Then run the same audit on three people who got the job you wanted. The gap between their grade and yours is your roadmap. No coach required. No 90-minute call.",
      stats: [
        ["Target fixes / report", "11 – 14"],
        ["Typical grade jump, 30d", "C+ → B+"],
        ["Cost vs. coach", "−$300/hr"],
      ],
    },
    {
      idx: "II.",
      persona: "COACH",
      who: "Career coach · solo & boutique",
      title: "White-label deliverables in minutes, not hours.",
      body:
        "Generate a branded PDF for any client in 30 seconds. Your logo, your colors, your prose where it counts. Charge for the diagnosis and spend the session on the work that actually requires you — story, positioning, judgement calls.",
      stats: [
        ["Time per client report", "2 min"],
        ["White-label PDF", "included"],
        ["Audits / mo", "50"],
      ],
    },
    {
      idx: "III.",
      persona: "SOURCER",
      who: "Recruiter · BD · founder · sales",
      title: "Pre-call signal quality, at the rate of your inbox.",
      body:
        "Audit any candidate or prospect from their profile page. Use the recruiter heat map and grade as a sanity check before you put a name on a shortlist or open with a cold pitch. Audit history is portable to your ATS or CRM.",
      stats: [
        ["Audit limit / mo", "500"],
        ["CSV export", "included"],
        ["API access", "Team plan"],
      ],
    },
  ];

  return (
    <section className="s" id="audiences">
      <div className="container-x">
        <div className="section-head">
          <div className="section-num">§ 03 — AUDIENCE</div>
          <h2>
            Built for people who&apos;d rather be told{" "}
            <em>specifically</em>.
          </h2>
          <p className="deck">
            Three groups we built the audit for. The use-cases share a spine:
            time-pressed professionals who treat their LinkedIn presence like a
            working asset, not a vanity board.
          </p>
        </div>

        <div>
          {rows.map((r) => (
            <article key={r.persona} className="aud-row">
              <div
                className="font-mono"
                style={{
                  fontSize: 11,
                  letterSpacing: "0.1em",
                  color: "var(--text-3)",
                  textTransform: "uppercase",
                  paddingTop: 4,
                }}
              >
                <b style={{ color: "var(--accent)", fontWeight: 500 }}>{r.idx}</b>{" "}
                {r.persona}
              </div>
              <div>
                <div
                  className="font-mono"
                  style={{
                    fontSize: 13.5,
                    color: "var(--text-3)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    marginBottom: 14,
                  }}
                >
                  {r.who}
                </div>
                <h3
                  style={{
                    margin: "0 0 8px",
                    fontSize: 26,
                    letterSpacing: "-0.02em",
                    lineHeight: 1.15,
                    fontWeight: 500,
                  }}
                >
                  {r.title}
                </h3>
              </div>
              <p
                style={{
                  margin: 0,
                  color: "var(--text-2)",
                  fontSize: 15,
                  lineHeight: 1.55,
                  maxWidth: "44ch",
                }}
              >
                {r.body}
              </p>
              <div
                style={{ display: "flex", flexDirection: "column", gap: 8 }}
              >
                {r.stats.map(([k, v]) => (
                  <div
                    key={k}
                    className="font-mono"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr auto",
                      gap: 10,
                      fontSize: 11.5,
                      color: "var(--text-2)",
                      borderTop: "1px solid var(--border)",
                      paddingTop: 8,
                    }}
                  >
                    <span>{k}</span>
                    <b
                      style={{
                        color: "var(--text)",
                        fontWeight: 500,
                        textAlign: "right",
                      }}
                    >
                      {v}
                    </b>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const free: Feature[] = [
    { label: "Composite grade + score" },
    { label: (<><b>4</b> graded sections</>) },
    { label: "Top wins + highest-leverage fixes" },
    { label: "Emailed report + permanent link" },
    { label: "8 more sections in the extension", excluded: true },
  ];
  const pro: Feature[] = [
    { label: (<><b>25</b> audits / month</>) },
    { label: "Full 6-page PDF, no watermark" },
    { label: (<><b>Before/after</b> rewrites</>) },
    { label: "Audit history · 12 months" },
    { label: "CSV export" },
  ];
  const coach: Feature[] = [
    { label: (<><b>50</b> audits / month</>) },
    { label: (<><b>White-label</b> PDF · your brand</>) },
    { label: "Client folders & share links" },
    { label: "Bulk CSV import" },
    { label: "Priority email support" },
  ];
  const team: Feature[] = [
    { label: (<><b>500</b> audits / month</>) },
    { label: (<><b>API</b> & ATS / CRM webhooks</>) },
    { label: "Seats · 5 included" },
    { label: "SSO · SOC 2 (in progress)" },
    { label: "Slack & CSM support" },
  ];

  return (
    <section className="s" id="pricing">
      <div className="container-x">
        <div className="section-head">
          <div className="section-num">§ 04 — PRICING</div>
          <h2>
            Four prices. <em>One product.</em> Cancel in two clicks.
          </h2>
          <p className="deck">
            No trial, no card on file for the free audit. The paid plans differ
            on volume and exports, not on the quality of the audit. Whichever
            tier you&apos;re on, you get the same rubric and the same 6-page
            report.
          </p>
        </div>

        <div className="price-grid">
          <PricingTier
            tier="Tier 00 · Free"
            name="PDF audit"
            price="$0"
            per="/ no card"
            blurb="Drop your LinkedIn PDF and grade the 4 sections recruiters scan first — composite, section grades, top wins, and your highest-leverage fixes."
            features={free}
            ctaLabel={AUDIT_CTA}
            ctaHref="/audit"
          />
          <PricingTier
            featured
            tier="Tier 01 · Pro"
            name="Pro"
            price="$19"
            per="/ month"
            blurb="25 audits per month for one person. The job-search and self-improvement plan."
            features={pro}
            ctaLabel="Start Pro"
          />
          <PricingTier
            tier="Tier 02 · Coach"
            name="Coach"
            price="$49"
            per="/ month"
            blurb="For solo coaches and small career-services teams. White-label, batch-ready."
            features={coach}
            ctaLabel="Start Coach"
          />
          <PricingTier
            tier="Tier 03 · Team"
            name="Team"
            price="$149"
            per="/ month"
            blurb="Sourcers, recruiters, BD. Volume, API, and audit-trail portability."
            features={team}
            ctaLabel="Talk to sales"
          />
        </div>
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="cta-final" id="cta">
      <div className="container-x cta-final-grid">
        <div>
          <div className="meta-line">
            <span>§ 05 — ACTION</span>
            <span>CHROME EXTENSION · COMING SOON</span>
          </div>
          <h2>
            Find out what your profile is <em>actually</em> worth.
          </h2>
          <p>
            {EXTENSION_COMING_SOON} Join the waitlist and we&apos;ll email you
            the moment it ships. Want a grade today? Drop your profile PDF for an
            honest read on the 4 sections recruiters scan first —{" "}
            <Link href="/audit" style={{ color: "inherit", borderBottom: "1px solid currentColor" }}>
              {AUDIT_CTA}
            </Link>
          </p>
        </div>
        <WaitlistForm
          buttonLabel={WAITLIST_CTA}
          fineprint={["Chrome & Edge", "No card required", "We email you at launch"]}
        />
      </div>
    </section>
  );
}

