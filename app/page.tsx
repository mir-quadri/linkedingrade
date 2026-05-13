import WaitlistForm from "./components/WaitlistForm";

export default function Page() {
  return (
    <>
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <Rubric />
      <WhoItsFor />
      <Pricing />
      <Faq />
      <FinalCta />
      <SiteFooter />
    </>
  );
}

function Brand() {
  return (
    <a href="#top" className="brand">
      <span className="brand-word">linkedingrade</span>
      <span className="brand-est">— EST. 2026</span>
    </a>
  );
}

function Nav() {
  return (
    <nav className="top">
      <div className="container nav-inner">
        <Brand />
        <div className="nav-links">
          <a href="#rubric">The rubric</a>
          <a href="#how">How it works</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </div>
        <a href="#waitlist" className="nav-cta">
          Get early access
        </a>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="hero" id="top">
      <div className="container">
        <div className="hero-masthead">
          <span>
            <strong>VOL. 01</strong>&nbsp;&nbsp;NO. 01
          </span>
          <span>LAUNCH ISSUE · 2026</span>
          <span>THE PROFILE, GRADED</span>
        </div>

        <div className="hero-grid">
          <div>
            <h1>
              Find out what a senior recruiter <em>actually</em> thinks of your
              profile.
            </h1>
            <p className="lede">
              A 30-second extension audits any LinkedIn profile against{" "}
              <b>the rubric senior recruiters use</b>. Letter grade, 12 sections
              rated, before/after rewrites you can copy. No hedging. No
              horoscopes.
            </p>

            <WaitlistForm id="waitlist" />
            <div className="hero-meta">
              <span>Free for first audit</span>
              <span>No card required</span>
              <span>Chrome &amp; Edge</span>
            </div>
          </div>

          <SampleAudit />
        </div>
      </div>
    </section>
  );
}

function SampleAudit() {
  return (
    <div className="sample" aria-label="Sample audit (anonymized)">
      <div className="sample-head">
        <span className="label">Sample audit</span>
        <span className="live">Anonymized</span>
      </div>
      <div className="sample-body">
        <div className="donut" role="img" aria-label="Score 73 out of 100, grade B">
          <svg width="124" height="124" viewBox="0 0 124 124" aria-hidden="true">
            <circle
              cx="62"
              cy="62"
              r="52"
              fill="none"
              stroke="var(--surface-sub)"
              strokeWidth="8"
            />
            <circle
              cx="62"
              cy="62"
              r="52"
              fill="none"
              stroke="var(--text)"
              strokeWidth="8"
              strokeDasharray="326.7"
              strokeDashoffset="86.6"
              strokeLinecap="round"
            />
          </svg>
          <div className="grade" aria-hidden="true">
            B
          </div>
          <div className="score" aria-hidden="true">
            73 / 100
          </div>
        </div>
        <div className="subject">
          <div className="name">Subject · anonymized</div>
          <div className="role">VP, Engineering · top-3 US bank</div>
          <div className="tags">
            <span className="tag">12y exp</span>
            <span className="tag">NYC</span>
            <span className="tag">CMU &apos;15</span>
            <span className="tag flag">Photo dated</span>
          </div>
        </div>
      </div>
      <div className="sample-rows">
        <SampleRow k="Headline" w="88%" tone="good" grade="B+" />
        <SampleRow k="About" w="48%" tone="warn" grade="C" />
        <SampleRow k="Experience" w="72%" grade="B" />
        <SampleRow k="Skills" w="90%" tone="good" grade="A–" />
        <SampleRow k="Activity" w="24%" tone="bad" grade="D" />
        <SampleRow k="Photo" w="78%" grade="B+" />
      </div>
      <div className="sample-foot">
        <span>
          Recruiter signal · <b>73 / 100</b>
        </span>
        <span>
          Sample · <b>not real data</b>
        </span>
      </div>
    </div>
  );
}

function SampleRow({
  k,
  w,
  tone,
  grade,
}: {
  k: string;
  w: string;
  tone?: "good" | "warn" | "bad";
  grade: string;
}) {
  const cls = tone ?? "";
  return (
    <div className="row">
      <span className="k">{k}</span>
      <span className="bar">
        <i className={cls} style={{ width: w }} />
      </span>
      <span className={`g ${cls}`.trim()}>{grade}</span>
    </div>
  );
}

function Problem() {
  return (
    <section className="sec" id="problem">
      <div className="container">
        <div className="sec-meta">
          <span>01 — The problem</span>
          <span>WHY YOUR PROFILE IS UNDER-PERFORMING</span>
        </div>

        <div className="problem-grid">
          <div>
            <h2>
              Most LinkedIn profiles fail. Not because the people are bad —
              because the <em>profile</em> is.
            </h2>
            <p className="dek">
              Six seconds. That&apos;s how long a senior recruiter spends
              scanning a profile before deciding to keep reading or close the
              tab. Most profiles fail in that window — not for lack of
              credentials, but because the credentials were written for the
              writer, not the reader.
            </p>
          </div>
          <div>
            <p className="pull">
              &ldquo;Your profile is your only durable career artifact. The job
              you&apos;re applying to today didn&apos;t exist 5 years ago.{" "}
              <em>The profile that gets you there has to.</em>&rdquo;
            </p>
            <div className="stat-grid">
              <div className="stat-cell">
                <div className="num">6 sec</div>
                <div className="lbl">
                  Typical time a recruiter spends scanning a profile before
                  deciding to keep reading <span className="sup">¹</span>
                </div>
              </div>
              <div className="stat-cell">
                <div className="num">12</div>
                <div className="lbl">
                  Sections of a profile that get graded. Most people have never
                  been told what they are.
                </div>
              </div>
              <div className="stat-cell">
                <div className="num">A–F</div>
                <div className="lbl">
                  Letter grades, the same scale used everywhere from school to
                  credit. Unambiguous on purpose.
                </div>
              </div>
              <div className="stat-cell">
                <div className="num">30 sec</div>
                <div className="lbl">
                  From clicking the extension to a full PDF report. The opposite
                  of a coaching session.
                </div>
              </div>
            </div>
            <p className="stat-footnote">
              ¹ Industry-cited average. Your recruiter may differ.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="sec" id="how">
      <div className="container">
        <div className="sec-meta">
          <span>02 — How it works</span>
          <span>FROM CLICK TO GRADE IN 30 SECONDS</span>
        </div>

        <h2 style={{ marginBottom: 48 }}>
          Open any profile. Click once. Get the verdict.
        </h2>

        <div className="steps">
          <Step
            num="STEP 01"
            title="Open any LinkedIn profile"
            body="Yours. A peer's. Your competitor's. A candidate you're sourcing. Anyone's. The extension lives in your browser, ready when you are."
          />
          <Step
            num="STEP 02"
            title="One click runs the rubric"
            body="12 sections graded against a framework calibrated to senior-recruiter standards. Letter grade per section, weighted into one composite score."
          />
          <Step
            num="STEP 03"
            title="Read the report. Make the fixes."
            body="A 6-page PDF with element ratings, before/after rewrites you can copy, and a prioritized action plan ranked by recruiter signal lift."
          />
        </div>
      </div>
    </section>
  );
}

function Step({
  num,
  title,
  body,
}: {
  num: string;
  title: string;
  body: string;
}) {
  return (
    <div className="step">
      <div className="num">{num}</div>
      <h3>{title}</h3>
      <p>{body}</p>
    </div>
  );
}

function Rubric() {
  const items: { k: string; v: string; d: string }[] = [
    {
      k: "01 · HEADLINE",
      v: "Promise & proof",
      d: "Does it state your real title, name a credible domain, and survive mobile truncation at 70 characters?",
    },
    {
      k: "02 · ABOUT",
      v: "Hook, range, CTA",
      d: "Three jobs in three paragraphs. Most profiles fail one. Many fail all three.",
    },
    {
      k: "03 · FEATURED",
      v: "Proof on the shelf",
      d: "Is your best work visible without scrolling? Or is your shelf empty?",
    },
    {
      k: "04 · EXPERIENCE",
      v: "Outcomes > titles",
      d: "Years described in lines, not lines described in years. The most-skimmed section gets the most-skipped writing.",
    },
    {
      k: "05 · SKILLS",
      v: "Top-3 alignment",
      d: "The top three skills are what the algorithm and the recruiter both see first. Most people pick wrong.",
    },
    {
      k: "06 · PHOTO",
      v: "Framing & recency",
      d: "Not whether you look good — whether you look like the role you're targeting, recently enough to be current.",
    },
    {
      k: "07 · BANNER",
      v: "Signal density",
      d: "Most banners are wallpaper. The best are billboards. Yours is probably the first.",
    },
    {
      k: "08 · ACTIVITY",
      v: "Cadence & depth",
      d: "Recruiters check your recent activity. They will see exactly what you've left them.",
    },
    {
      k: "09 · RECOMMENDATIONS",
      v: "Volume & recency",
      d: "Tie-breaker for senior roles. Three from the last 18 months beats fifteen from a decade ago.",
    },
    {
      k: "10 · CERTIFICATIONS",
      v: "Relevance & ordering",
      d: "The wrong cert dilutes credibility. The right cert in the wrong order does the same.",
    },
    {
      k: "11 · KEYWORDS",
      v: "15 must-haves",
      d: "Per role family. What the algorithm filters on. What you almost certainly don't have all of.",
    },
    {
      k: "12 · BUZZWORDS",
      v: "AI-flavor density",
      d: "“Results-driven leader passionate about scalable solutions.” Recruiters can taste ChatGPT-default in three words.",
    },
  ];

  return (
    <section className="sec" id="rubric">
      <div className="container">
        <div className="sec-meta">
          <span>03 — The rubric</span>
          <span>WHAT GETS GRADED, AND WHY</span>
        </div>

        <h2>Twelve sections. Five grade tiers. One opinion, defended.</h2>
        <p className="dek">
          Most &ldquo;AI profile tools&rdquo; are a wrapper around a generic LLM
          prompt. linkedingrade grades against{" "}
          <b>The Profile Rubric&trade;</b> — a published framework calibrated to
          the standards senior recruiters and hiring managers apply when they
          scan a profile. Each section has explicit criteria, examples, and
          weight.
        </p>

        <div className="rubric-grid">
          {items.map((item) => (
            <div className="rubric-cell" key={item.k}>
              <div className="k">{item.k}</div>
              <div className="v">{item.v}</div>
              <div className="d">{item.d}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function WhoItsFor() {
  return (
    <section className="sec" id="who">
      <div className="container">
        <div className="sec-meta">
          <span>04 — Built for</span>
          <span>WHO USES THIS, AND WHY THEY KEEP USING IT</span>
        </div>

        <h2 style={{ marginBottom: 48 }}>
          Built first for the job seeker who refuses to guess.
        </h2>

        <div className="who">
          <div className="who-main">
            <span className="badge">Primary user</span>
            <h3>The senior professional in active transition</h3>
            <p>
              You&apos;re mid-career or above, targeting $120k+ roles, and you
              know your profile matters more than your resume — because every
              interesting opportunity now starts on LinkedIn. You don&apos;t
              want a &ldquo;career coach&rdquo; telling you you&apos;re amazing.
              You want the honest read.
            </p>
            <ul className="who-list">
              <li>Audit your own profile. Get the score. Make the rewrites.</li>
              <li>
                Audit five competitor profiles. Reverse-engineer what works in
                your role.
              </li>
              <li>Re-audit weekly as you make changes. Track the score rise.</li>
              <li>
                Export the PDF. Share it with your trusted advisor for second
                opinions.
              </li>
            </ul>
          </div>

          <div className="who-side">
            <h4>Also useful for</h4>
            <div className="other">
              <div className="t">Career coaches &amp; resume writers</div>
              <div className="d">
                White-label the audit. Onboard a client in 5 minutes instead of
                45.
              </div>
            </div>
            <div className="other">
              <div className="t">Recruiters &amp; sourcers</div>
              <div className="d">
                Screen profile signal quality at scale. See past the buzzwords.
              </div>
            </div>
            <div className="other">
              <div className="t">Sales &amp; partnerships</div>
              <div className="d">
                Audit prospects as a credibility-building cold outreach hook.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section className="sec" id="pricing">
      <div className="container">
        <div className="sec-meta">
          <span>05 — Pricing</span>
          <span>SIMPLE AT LAUNCH, FAIR FOREVER</span>
        </div>

        <h2>Pay for the audit, not the platform.</h2>
        <p className="dek">
          Free for your first audit. Pay-as-you-go credits if you audit
          occasionally. Subscription if you audit constantly. No long-term
          contracts, no enterprise sales call required.
        </p>

        <div className="price-grid">
          <Plan name="Free" price="$0" period="forever">
            <li>
              <b>1 audit</b> on your own profile
            </li>
            <li>Watermarked PDF</li>
            <li>The full rubric, the real grade</li>
          </Plan>
          <Plan name="Credits" price="$29" period="one-time">
            <li>
              <b>20 audits</b>, no expiry
            </li>
            <li>Clean PDF, no watermark</li>
            <li>For one-time job-hunt sprints</li>
          </Plan>
          <Plan
            name="Pro"
            price="$19"
            period="per month"
            featured
            popularLabel="Most popular"
          >
            <li>
              <b>25 audits</b> / month
            </li>
            <li>Audit history, re-audit tracking</li>
            <li>Best for active job hunts</li>
          </Plan>
          <Plan name="Business" price="$49" period="per month">
            <li>
              <b>100 audits</b> / month
            </li>
            <li>White-label PDF, your branding</li>
            <li>For coaches &amp; recruiters</li>
          </Plan>
        </div>

        <p className="price-note">
          First 100 waitlist members lock in{" "}
          <b>50% off Pro for life</b>.
        </p>
      </div>
    </section>
  );
}

function Plan({
  name,
  price,
  period,
  featured,
  popularLabel,
  children,
}: {
  name: string;
  price: string;
  period: string;
  featured?: boolean;
  popularLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`plan${featured ? " feat" : ""}`}>
      {popularLabel && <span className="pop">{popularLabel}</span>}
      <div className="name">{name}</div>
      <div className="price">{price}</div>
      <div className="period">{period}</div>
      <ul>{children}</ul>
    </div>
  );
}

function Faq() {
  const items: { q: string; a: string }[] = [
    {
      q: "Can I just do this in ChatGPT?",
      a: "You can. You'd take screenshots, paste them in, write a 600-word prompt, hope the model holds the rubric consistently, and get text back. We compressed twelve minutes of that into thirty seconds, and the output is a designed PDF you'd be proud to share — not a chat transcript.",
    },
    {
      q: "Is this just a wrapper on Claude or GPT?",
      a: "The intelligence layer uses frontier models, like every serious AI product today. The defensible thing is everything around it — The Profile Rubric, the calibration to recruiter standards, the format, and the workflow. Models are commodities; opinions aren't.",
    },
    {
      q: "Will this get me banned from LinkedIn?",
      a: "No. The extension reads only the profile you're actively viewing in your own browser session — like a screen reader, not a scraper. No bulk crawling, no data resale, no auto-messaging. Same posture as every legitimate Chrome extension in this space.",
    },
    {
      q: "What about my privacy?",
      a: "Profile data is processed in-memory for the duration of the audit, then discarded. We don't store the profiles we audit. We don't sell or share any data. Your audit history is yours, deletable any time.",
    },
    {
      q: "How accurate is the grade?",
      a: "The rubric is calibrated to the frameworks senior recruiters and hiring managers use when scanning profiles. The grade is a strong signal of how a real recruiter would read your profile — not a guarantee of outcome. We grade what's gradeable, name what isn't, and tell you when we're uncertain.",
    },
    {
      q: "When does the extension launch?",
      a: "Public beta opens in Q2 2026. Waitlist members get first access plus a permanent 50% discount on Pro. We'll ship when it's better than the alternatives, not when the calendar says we should.",
    },
  ];

  return (
    <section className="sec" id="faq">
      <div className="container">
        <div className="sec-meta">
          <span>06 — Honest questions</span>
          <span>WHAT WE GET ASKED, ANSWERED STRAIGHT</span>
        </div>

        <h2 style={{ marginBottom: 48 }}>
          Things people ask before they install.
        </h2>

        <div className="faq">
          {items.map((item) => (
            <div className="faq-item" key={item.q}>
              <h4>{item.q}</h4>
              <p>{item.a}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="final">
      <div className="container">
        <div className="final-grid">
          <div>
            <h2>Find out what your profile is worth.</h2>
            <p>
              Free first audit. No card. Watermarked PDF you can read in five
              minutes and act on in thirty. The honest grade — yours when we
              launch.
            </p>
          </div>
          <WaitlistForm id="cta-waitlist" buttonLabel="Reserve my spot" />
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="site">
      <div className="container">
        <div className="foot-top">
          <div>
            <Brand />
            <p className="foot-mission">
              The honest grade on your LinkedIn profile. Built because telling
              people they&apos;re &ldquo;doing great&rdquo; wasn&apos;t helping
              anyone.
            </p>
          </div>
          <div className="foot-links">
            <div className="foot-col">
              <h5>Product</h5>
              <a href="#how">How it works</a>
              <a href="#rubric">The rubric</a>
              <a href="#pricing">Pricing</a>
              <a href="#faq">FAQ</a>
            </div>
            <div className="foot-col">
              <h5>Company</h5>
              <span className="foot-soon">About</span>
              <span className="foot-soon">Editorial standards</span>
              <span className="foot-soon">Privacy</span>
              <span className="foot-soon">Contact</span>
            </div>
          </div>
        </div>
        <div className="foot-meta">
          <span>© 2026 LINKEDINGRADE</span>
          <span>SET IN FRAUNCES, GEIST &amp; GEIST MONO</span>
          <span>VOL. 01 · NO. 01 · LAUNCH</span>
        </div>
      </div>
    </footer>
  );
}
