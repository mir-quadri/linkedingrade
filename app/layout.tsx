import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const title = "linkedingrade — AI LinkedIn profile audits in 30 seconds";
const description =
  "Chrome extension that grades any LinkedIn profile and shows you exactly what to fix. 6-page PDF report. Free to start.";

export const metadata: Metadata = {
  title,
  description,
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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} antialiased bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50`}
      >
        {children}
      </body>
    </html>
  );
}
