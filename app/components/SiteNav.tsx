import Link from "next/link";

import { WAITLIST_CTA_SHORT } from "@/lib/copy";

import BrandLockup from "./BrandLockup";
import ThemeToggle from "./ThemeToggle";

export default function SiteNav() {
  return (
    <nav className="nav" aria-label="Primary">
      <div className="container-x nav-row">
        <Link href="/" aria-label="LinkedInGrade home">
          <BrandLockup size={24} fontSize={17} />
        </Link>
        <div className="nav-links" role="navigation">
          <Link href="/#sample">Sample</Link>
          <Link href="/#how">How it works</Link>
          <Link href="/#audiences">Built for</Link>
          <Link href="/#pricing">Pricing</Link>
          <Link href="/audit">Audit</Link>
        </div>
        <div className="nav-cta">
          <ThemeToggle />
          <Link href="/#cta" className="btn btn-primary">
            {WAITLIST_CTA_SHORT}
          </Link>
        </div>
      </div>
    </nav>
  );
}
