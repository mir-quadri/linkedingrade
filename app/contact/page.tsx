import type { Metadata } from "next";

import TextPage from "../components/TextPage";

export const metadata: Metadata = {
  title: "Contact — LinkedInGrade",
  description:
    "Get in touch about the waitlist, press, privacy requests, or anything else.",
};

export default function ContactPage() {
  return (
    <TextPage
      sectionNum="§ C — CONTACT"
      eyebrow="ONE INBOX · ONE HUMAN"
      title={
        <>
          Say <em>hello.</em>
        </>
      }
      deck="There's no contact form. There's an inbox, and a person who reads it."
    >
      <h2>Email</h2>
      <p>
        <a href="mailto:hello@linkedingrade.com">hello@linkedingrade.com</a>
      </p>
      {/* TODO: confirm this inbox exists and is monitored */}

      <h2>What to write about</h2>
      <ul>
        <li>
          <b>Waitlist questions.</b> Sign-up not working, want to update your
          address, want off the list.
        </li>
        <li>
          <b>Privacy and data requests.</b> Ask what we have, ask us to delete
          it. See the <a href="/privacy">privacy page</a> for what we collect.
        </li>
        <li>
          <b>Press &amp; partnerships.</b> Quick replies, no PR agency in the
          loop.
        </li>
        <li>
          <b>Security reports.</b> Found something that looks broken or unsafe?
          Tell us before telling the internet.
        </li>
        <li>
          <b>Everything else.</b> Feedback on the pitch, the rubric, the brand
          — all read.
        </li>
      </ul>

      <div className="text-page-note">
        We&apos;re pre-launch and small. Expect a reply within a few working
        days — sometimes faster, occasionally slower. Please be patient with us.
      </div>
    </TextPage>
  );
}
