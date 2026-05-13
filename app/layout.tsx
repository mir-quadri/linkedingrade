import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const title = "LinkedInGrade — the honest LinkedIn audit";
const description =
  "A 30-second Chrome extension audits any LinkedIn profile and returns a 6-page report. Letter grade, recruiter heat map, before/after rewrites, priority action plan.";

// TODO: generate 1200×630 OG PNG per /design/LinkedInGrade Identity.html § 04 and wire to openGraph.images.
export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://linkedingrade.com"),
  openGraph: {
    title,
    description,
    type: "website",
    url: "https://linkedingrade.com",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  // TODO: export /public/apple-touch-icon.png (180×180) from /public/favicon.svg and add to icons.apple.
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
