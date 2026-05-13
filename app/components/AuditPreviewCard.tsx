type Row = {
  k: string;
  pct: number;
  grade: string;
  band?: "default" | "warn" | "bad" | "good";
};

const ROWS: Row[] = [
  { k: "Headline", pct: 84, grade: "B+", band: "good" },
  { k: "About", pct: 58, grade: "C", band: "warn" },
  { k: "Experience", pct: 76, grade: "B" },
  { k: "Skills", pct: 90, grade: "A−", band: "good" },
  { k: "Activity", pct: 34, grade: "D", band: "bad" },
  { k: "Photo", pct: 78, grade: "B+" },
];

const barColor = (band?: Row["band"]) => {
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

export default function AuditPreviewCard() {
  return (
    <aside
      role="img"
      aria-label="Sample audit preview. Grade B minus, 73 out of 100."
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border-2)",
        borderRadius: "var(--r-lg)",
        overflow: "hidden",
        fontSize: 13,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "14px 18px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface-sub)",
        }}
      >
        <span
          className="font-mono"
          style={{
            fontSize: 11,
            letterSpacing: "0.08em",
            color: "var(--text-3)",
            textTransform: "uppercase",
          }}
        >
          SAMPLE AUDIT
        </span>
        <span
          className="font-mono"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 11,
            color: "var(--text-3)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          <span
            aria-hidden="true"
            style={{
              width: 6,
              height: 6,
              background: "var(--text-3)",
              borderRadius: "50%",
            }}
          />
          anonymized
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          padding: "22px 22px 18px",
          display: "grid",
          gridTemplateColumns: "148px 1fr",
          gap: 22,
          alignItems: "center",
        }}
        className="audit-body"
      >
        <ScoreDonut />
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <div style={{ fontWeight: 500, fontSize: 15 }}>
            Subject · anonymized
          </div>
          <div style={{ color: "var(--text-2)", fontSize: 13 }}>
            VP, Engineering · top-3 US bank
          </div>
          <div
            style={{
              marginTop: 10,
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <Tag>10y exp</Tag>
            <Tag>NYC</Tag>
            <Tag>CMU &apos;15</Tag>
            <Tag warn>photo dated</Tag>
          </div>
        </div>
      </div>

      {/* Rows */}
      <div style={{ borderTop: "1px solid var(--border)" }}>
        {ROWS.map((r, i) => (
          <div
            key={r.k}
            style={{
              display: "grid",
              gridTemplateColumns: "130px 1fr 60px",
              alignItems: "center",
              padding: "10px 22px",
              borderTop: i === 0 ? "none" : "1px solid var(--border)",
              gap: 14,
            }}
          >
            <span
              className="font-mono"
              style={{
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--text-2)",
              }}
            >
              {r.k}
            </span>
            <div
              style={{
                height: 6,
                background: "var(--surface-sub)",
                borderRadius: 2,
                position: "relative",
                overflow: "hidden",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${r.pct}%`,
                  background: barColor(r.band),
                }}
              />
            </div>
            <span
              className="font-mono"
              style={{
                fontSize: 14,
                fontWeight: 500,
                textAlign: "right",
                letterSpacing: "-0.01em",
                color: gradeColor(r.band),
              }}
            >
              {r.grade}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div
        style={{
          padding: "14px 22px",
          display: "flex",
          justifyContent: "space-between",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-sub)",
        }}
        className="font-mono"
      >
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          RECRUITER SIGNAL ·{" "}
          <b style={{ color: "var(--text)", fontWeight: 500 }}>73 / 100</b>
        </span>
        <span
          style={{
            fontSize: 11,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: "var(--text-3)",
          }}
        >
          SAMPLE · NOT REAL DATA
        </span>
      </div>
    </aside>
  );
}

function ScoreDonut() {
  return (
    <div style={{ position: "relative", width: 148, height: 148, margin: "0 auto" }}>
      <svg
        width={148}
        height={148}
        viewBox="0 0 148 148"
        style={{ transform: "rotate(-90deg)" }}
        aria-hidden="true"
      >
        <circle
          cx={74}
          cy={74}
          r={62}
          fill="none"
          stroke="var(--border)"
          strokeWidth={10}
        />
        <circle
          cx={74}
          cy={74}
          r={62}
          fill="none"
          stroke="var(--text)"
          strokeWidth={10}
          strokeDasharray="389.557"
          strokeDashoffset="105.18"
          strokeLinecap="butt"
        />
      </svg>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            fontSize: 64,
            fontWeight: 500,
            letterSpacing: "-0.05em",
            lineHeight: 1,
          }}
        >
          B
          <sup
            style={{
              fontSize: 28,
              color: "var(--accent)",
              fontWeight: 500,
              top: "-0.5em",
            }}
          >
            −
          </sup>
        </div>
        <div
          className="font-mono"
          style={{
            fontSize: 11,
            color: "var(--text-3)",
            letterSpacing: "0.06em",
            marginTop: 6,
            textTransform: "uppercase",
          }}
        >
          73 / 100
        </div>
      </div>
    </div>
  );
}

function Tag({ children, warn }: { children: React.ReactNode; warn?: boolean }) {
  return (
    <span
      className="font-mono"
      style={{
        fontSize: 10.5,
        letterSpacing: "0.04em",
        padding: "3px 7px",
        border: `1px solid ${
          warn ? "color-mix(in oklab, var(--accent) 50%, transparent)" : "var(--border-2)"
        }`,
        borderRadius: "var(--r-sm)",
        color: warn ? "var(--accent)" : "var(--text-2)",
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}
