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
  "Drop your LinkedIn profile PDF and get a real letter grade on the 4 sections recruiters scan first. The full 12-section Chrome extension — 6-page report, recruiter heat map, before/after rewrites — is coming soon.";

export const metadata: Metadata = {
  title,
  description,
  metadataBase: new URL("https://linkedingrade.com"),
  openGraph: {
    title,
    description,
    type: "website",
    url: "https://linkedingrade.com",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "LinkedInGrade — the honest LinkedIn audit",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og.png"],
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
