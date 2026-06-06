import Link from "next/link";

import { EXTENSION_COMING_SOON } from "@/lib/copy";

import Logo from "./Logo";
import Wordmark from "./Wordmark";

export default function SiteFooter() {
  return (
    <footer style={{ padding: "64px 0 56px" }}>
      <div className="container-x">
        <div className="foot-grid">
          <div>
            <Link
              href="/"
              aria-label="LinkedInGrade home"
              style={{ display: "inline-flex" }}
            >
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 9,
                  fontSize: 17,
                  fontWeight: 600,
                  letterSpacing: "-0.025em",
                }}
              >
                <Logo size={22} />
                <Wordmark />
              </span>
            </Link>
            <p
              style={{
                color: "var(--text-2)",
                fontSize: 13.5,
                maxWidth: "34ch",
                margin: "8px 0 0",
                lineHeight: 1.5,
              }}
            >
              The honest LinkedIn audit. Drop your profile PDF, get a real
              letter grade on the 4 sections recruiters scan first.{" "}
              {EXTENSION_COMING_SOON} Independent and not affiliated with
              LinkedIn Corp.
            </p>
          </div>
          <FooterCol
            title="Product"
            links={[
              ["Sample audit", "/#sample"],
              ["How it works", "/#how"],
              ["Pricing", "/#pricing"],
              ["Changelog", "#"],
            ]}
          />
          <FooterCol
            title="Use cases"
            links={[
              ["For job seekers", "/#audiences"],
              ["For coaches", "/#audiences"],
              ["For recruiters", "/#audiences"],
              ["For sales", "/#audiences"],
            ]}
          />
          <FooterCol
            title="Company"
            links={[
              ["Method", "#"],
              ["Privacy", "/privacy"],
              ["Terms", "/terms"],
              ["Contact", "/contact"],
            ]}
          />
        </div>
        <div className="foot-meta">
          <span>© 2026 LINKEDINGRADE</span>
          <span>SET IN GEIST &amp; GEIST MONO</span>
          <span>VOL. 01 · NO. 01 · LAUNCH</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <h5
        className="font-mono"
        style={{
          margin: "0 0 14px",
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: "var(--text-3)",
          fontWeight: 500,
        }}
      >
        {title}
      </h5>
      <ul
        style={{
          margin: 0,
          padding: 0,
          listStyle: "none",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {links.map(([label, href]) => (
          <li key={label}>
            <Link
              href={href}
              style={{
                color: "var(--text-2)",
                fontSize: 14,
              }}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
