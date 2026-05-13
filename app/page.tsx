import WaitlistForm from "./components/WaitlistForm";

const cardBase =
  "rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900";

export default function Page() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-2xl px-6">
        <Hero />
        <SampleAudit />
        <WhyExtension />
        <BuiltFor />
        <Pricing />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-neutral-200 bg-neutral-50/80 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
      <nav className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
        <a
          href="#top"
          className="text-base font-semibold tracking-tight text-neutral-900 dark:text-neutral-50"
        >
          linkedingrade
        </a>
        <a
          href="#waitlist"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:focus-visible:ring-offset-neutral-950"
        >
          Get early access
        </a>
      </nav>
    </header>
  );
}

function Hero() {
  return (
    <section id="top" className="py-16">
      <p className="text-xs font-semibold uppercase tracking-widest text-blue-600">
        Chrome Extension — Launching Soon
      </p>
      <h1 className="mt-4 text-4xl font-semibold tracking-tight text-neutral-900 sm:text-5xl dark:text-neutral-50">
        Your LinkedIn profile is probably a C+.
      </h1>
      <p className="mt-6 text-lg leading-relaxed text-neutral-600 dark:text-neutral-400">
        One-click AI audit on any LinkedIn profile. Six-page report with
        element-by-element ratings, before/after rewrites, and a recruiter heat
        map. 30 seconds, not 30 minutes with ChatGPT.
      </p>
      <div className="mt-8">
        <WaitlistForm id="waitlist" />
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Join the waitlist. First 100 get 50% off for life.
        </p>
      </div>
    </section>
  );
}

function SampleAudit() {
  return (
    <section className="py-16">
      <div className={cardBase}>
        <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 dark:text-neutral-400">
          Sample audit — VP Product at a top-3 US bank
        </p>
        <div className="mt-6 flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-8">
          <ScoreRing score={58} />
          <div className="text-center sm:text-left">
            <p className="text-6xl font-semibold leading-none text-amber-500">
              C+
            </p>
            <p className="mt-3 text-base text-neutral-600 dark:text-neutral-400">
              Strong foundation. Two rewrites unlock 33 score points.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ScoreRing({ score }: { score: number }) {
  const size = 128;
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Score ${score} out of 100`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-neutral-200 dark:stroke-neutral-800"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-teal-600"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
          {score}
        </span>
        <span className="text-xs text-neutral-600 dark:text-neutral-400">
          / 100
        </span>
      </div>
    </div>
  );
}

function WhyExtension() {
  return (
    <section className="py-16">
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
        Why an extension, not ChatGPT
      </h2>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <MetricCard
          label="ChatGPT"
          big="12 min"
          small="Screenshot. Paste. Hope."
        />
        <MetricCard
          label="linkedingrade"
          big="30 sec"
          bigClass="text-teal-600"
          small="One click. Done."
          highlight
        />
        <MetricCard
          label="PDF report"
          big="6 pages"
          small="Magazine-grade. Shareable."
        />
      </div>
    </section>
  );
}

function MetricCard({
  label,
  big,
  bigClass,
  small,
  highlight,
}: {
  label: string;
  big: string;
  bigClass?: string;
  small: string;
  highlight?: boolean;
}) {
  const border = highlight
    ? "border-2 border-teal-600"
    : "border border-neutral-200 dark:border-neutral-800";
  return (
    <div className={`rounded-xl bg-white p-6 dark:bg-neutral-900 ${border}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 dark:text-neutral-400">
        {label}
      </p>
      <p
        className={`mt-3 text-3xl font-semibold tracking-tight ${
          bigClass ?? "text-neutral-900 dark:text-neutral-50"
        }`}
      >
        {big}
      </p>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
        {small}
      </p>
    </div>
  );
}

function BuiltFor() {
  const rows: { title: string; accent: string; body: string }[] = [
    {
      title: "Job seekers",
      accent: "bg-blue-600",
      body: "Audit yours. Audit competitors. Reverse-engineer what works.",
    },
    {
      title: "Career coaches",
      accent: "bg-teal-600",
      body: "White-label PDFs. Onboard a client in 5 minutes, not 45.",
    },
    {
      title: "Recruiters & sourcers",
      accent: "bg-orange-600",
      body: "Screen 20 candidates in 10 minutes. See past the buzzwords.",
    },
  ];

  return (
    <section className="py-16">
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
        Built for
      </h2>
      <div className="mt-8 space-y-3">
        {rows.map((row) => (
          <div
            key={row.title}
            className="flex overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
          >
            <div className={`w-1 shrink-0 ${row.accent}`} aria-hidden="true" />
            <div className="p-6">
              <p className="text-base font-semibold text-neutral-900 dark:text-neutral-50">
                {row.title}
              </p>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {row.body}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Pricing() {
  const tiers: {
    name: string;
    badge?: string;
    price: string;
    desc: string;
    highlight?: boolean;
  }[] = [
    { name: "Free", price: "$0", desc: "1 audit/month, watermarked" },
    { name: "Credits", price: "$29", desc: "20 audits, no expiry" },
    {
      name: "Pro",
      badge: "Most popular",
      price: "$19/mo",
      desc: "25 audits/month",
      highlight: true,
    },
    { name: "Business", price: "$49/mo", desc: "100 audits, white-label" },
  ];

  return (
    <section className="py-16">
      <h2 className="text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl dark:text-neutral-50">
        Pricing — when we launch
      </h2>
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiers.map((tier) => (
          <div
            key={tier.name}
            className={`rounded-xl bg-white p-6 dark:bg-neutral-900 ${
              tier.highlight
                ? "border-2 border-blue-600"
                : "border border-neutral-200 dark:border-neutral-800"
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-600 dark:text-neutral-400">
              {tier.name}
            </p>
            {tier.badge && (
              <p className="mt-2 inline-block rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-white">
                {tier.badge}
              </p>
            )}
            <p className="mt-3 text-2xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-50">
              {tier.price}
            </p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {tier.desc}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FinalCTA() {
  return (
    <section className="py-16">
      <div className="rounded-xl bg-blue-600/10 px-6 py-10 text-center">
        <p className="text-xl font-semibold tracking-tight text-neutral-900 sm:text-2xl dark:text-neutral-50">
          First 100 waitlist members get 50% off for life.
        </p>
        <div className="mt-6 flex justify-center">
          <a
            href="#waitlist"
            className="rounded-md bg-blue-600 px-5 py-3 text-base font-medium text-white transition hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:focus-visible:ring-offset-neutral-950"
          >
            Reserve my spot
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-neutral-200 dark:border-neutral-800">
      <div className="mx-auto max-w-2xl px-6 py-8 text-center text-sm text-neutral-600 dark:text-neutral-400">
        © 2026 linkedingrade. Built with caffeine and curiosity.
      </div>
    </footer>
  );
}
