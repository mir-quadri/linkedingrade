import type { Metadata } from "next";

import TextPage from "../components/TextPage";

const LAST_UPDATED = "May 2026";

export const metadata: Metadata = {
  title: "Terms of Use — LinkedInGrade",
  description:
    "The honest version: what this site is, what it isn't, and what you can expect from the waitlist.",
};

export default function TermsPage() {
  return (
    <TextPage
      sectionNum="§ B — TERMS"
      eyebrow="PRE-LAUNCH · WAITLIST SITE"
      title={
        <>
          The honest <em>terms</em>.
        </>
      }
      deck="A short, plain-language version of what you're agreeing to by using this site or joining the waitlist. We'll write a longer version when there's an actual product to sell."
      updated={LAST_UPDATED}
    >
      <h2>What this site is</h2>
      <p>
        linkedingrade.com is a marketing and waitlist site for an upcoming
        Chrome extension. The extension is in development. The site exists to
        describe what we&apos;re building and let interested people sign up to
        hear when it launches.
      </p>

      <h2>The waitlist</h2>
      <p>
        Joining the waitlist is free. It does not create a payment obligation,
        a subscription, or any kind of contract for a future product. It also
        does not guarantee that you will receive the product, that it will
        launch on any particular date, or that the eventual terms of service
        will look exactly like anything described on this page.
      </p>

      <h2>The product is still being built</h2>
      <p>
        Anything this site says about the extension — its features, the audit
        rubric, the pricing tiers, the launch window — is the current plan and
        is subject to change. Real products evolve before they ship. We&apos;ll
        keep the site honest, but we can&apos;t promise that everything described
        here will look identical on launch day.
      </p>

      <h2>Not affiliated with LinkedIn</h2>
      <p>
        <b>LinkedInGrade is independent.</b> It is not affiliated with, endorsed
        by, sponsored by, or otherwise connected to LinkedIn Corporation or
        Microsoft Corporation. &ldquo;LinkedIn&rdquo; is a registered trademark
        of LinkedIn Corporation; the name appears here only to describe the
        platform our future extension is designed to work alongside.
      </p>

      <h2>Acceptable use</h2>
      <p>
        Be a reasonable visitor. Specifically, please don&apos;t:
      </p>
      <ul>
        <li>Try to break the site, probe it for vulnerabilities without permission, or attack the infrastructure it runs on.</li>
        <li>Submit junk, abusive, or automated sign-ups to the waitlist.</li>
        <li>Scrape the site at a rate that affects its availability for others.</li>
        <li>Impersonate someone else when signing up.</li>
      </ul>
      <p>
        If you spot a security issue, please tell us — see the contact page.
      </p>

      <h2>The site is provided &ldquo;as is&rdquo;</h2>
      <p>
        We do our best to keep the site accurate and online, but we provide it
        without warranties of any kind. To the extent allowed by law, we are
        not liable for losses that come from your use of (or inability to use)
        the site, including any reliance on forward-looking descriptions of a
        product that isn&apos;t shipped yet.
      </p>
      {/* LEGAL-REVIEW: a lawyer should confirm the warranty disclaimer and limitation-of-liability language meets the requirements of the operator's eventual jurisdiction, and whether consumer-protection carve-outs (e.g. UK / EU) need explicit acknowledgement. */}

      <h2>Links to other sites</h2>
      <p>
        Where this site links to a third party (for example, a press article or
        a tool we use), those sites have their own terms and privacy practices
        and we&apos;re not responsible for them.
      </p>

      <h2>Changes to these terms</h2>
      <p>
        When this page changes, the date at the top will change with it. If we
        ever turn the waitlist into something more (an account, a paid
        subscription), we&apos;ll publish proper product terms before that
        happens and ask you to agree to them.
      </p>

      <h2>Contact</h2>
      <p>
        Questions about these terms?{" "}
        <a href="mailto:hello@linkedingrade.com">hello@linkedingrade.com</a>.
      </p>
      {/* LEGAL-REVIEW: once a legal entity exists, add the entity name, registered address, and governing-law / jurisdiction clause here. */}
    </TextPage>
  );
}
