type Row = {
  t: string;
  d: string;
  g: string;
  band?: "default" | "warn" | "bad" | "good";
};

const ROWS: Row[] = [
  { t: "Headline", d: "Specificity, hook, keyword density", g: "B+", band: "good" },
  { t: "About", d: "Story arc, evidence, AI-tell language", g: "C", band: "warn" },
  { t: "Experience", d: "Outcome verbs, scope signal, dates", g: "B" },
  {
    t: "Skills & endorsements",
    d: "Relevance, recency, social proof",
    g: "A−",
    band: "good",
  },
  {
    t: "Activity",
    d: "Posting cadence, engagement quality",
    g: "D",
    band: "bad",
  },
  {
    t: "Photo & banner",
    d: "Crop, lighting, recency, banner intent",
    g: "B+",
  },
];

const gradeColor = (band?: Row["band"]) => {
  switch (band) {
    case "good":
      return "var(--success)";
    case "warn":
      return "var(--warning)";
    case "bad":
      return "var(--accent)";
    default:
      return "var(--text)";
  }
};

export default function AuditReportCard() {
  return (
    <div
      role="img"
      aria-label="Sample audit report. Composite grade B minus, 73 out of 100, 64th percentile."
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 22px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          <b style={{ color: "var(--text)", fontWeight: 500 }}>SAMPLE AUDIT</b>{" "}
          · ANONYMIZED PROFILE
        </div>
        <span
          className="font-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-3)",
            padding: "4px 8px",
            border: "1px solid var(--border-2)",
            borderRadius: "var(--r-sm)",
          }}
        >
          REDACTED · SAMPLE
        </span>
      </div>

      {/* Body grid */}
      <div className="report-grid">
        <div
          style={{
            padding: 22,
            textAlign: "center",
            background: "var(--surface-sub)",
          }}
          className="report-grade-pane"
        >
          <div
            className="font-mono"
            style={{
              fontSize: 11,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "var(--text-3)",
              marginBottom: 8,
            }}
          >
            Composite
          </div>
          <div
            style={{
              fontSize: 120,
              lineHeight: 1,
              letterSpacing: "-0.06em",
              fontWeight: 500,
              display: "inline-flex",
              alignItems: "start",
            }}
          >
            B
            <sup
              style={{
                fontSize: 42,
                color: "var(--accent)",
                fontWeight: 500,
                marginLeft: 2,
              }}
            >
              −
            </sup>
          </div>
          <div
            className="font-mono"
            style={{
              fontSize: 12,
              letterSpacing: "0.04em",
              color: "var(--text-2)",
              marginTop: 10,
              textTransform: "uppercase",
            }}
          >
            73 / 100 · P64
          </div>
        </div>

        <div>
          {ROWS.map((r, i) => (
            <div
              key={r.t}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 90px",
                alignItems: "center",
                padding: "14px 22px",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
                gap: 18,
              }}
            >
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <div
                  style={{
                    fontWeight: 500,
                    fontSize: 14,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {r.t}
                </div>
                <div style={{ fontSize: 12.5, color: "var(--text-3)" }}>
                  {r.d}
                </div>
              </div>
              <div
                className="font-mono"
                style={{
                  fontSize: 22,
                  textAlign: "right",
                  letterSpacing: "-0.02em",
                  fontWeight: 500,
                  color: gradeColor(r.band),
                }}
              >
                {r.g}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="report-foot">
        <div>
          <h4>Top wins</h4>
          <ul className="wins">
            <li>Headline names a specific outcome, not a title</li>
            <li>Endorsement set aligns with current role within 12 months</li>
            <li>Three quantified leadership outcomes in current role</li>
          </ul>
        </div>
        <div>
          <h4>Highest-leverage fixes</h4>
          <ul className="fixes">
            <li>Rewrite About paragraph 2 — three flagged cliché phrases</li>
            <li>Add 1 post per week for 6 weeks; current cadence: 1 / 90d</li>
            <li>Re-shoot photo or recrop — head fills 38% of frame, low</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
