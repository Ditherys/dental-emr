import type { ReactNode } from "react";

import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import "react-advanced-odontogram/emr-style.css";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
});

export const metadata: Metadata = {
  title: {
    default: "Dental EMR",
    template: "%s | Dental EMR",
  },
  description: "Dental EMR & Practice Management Platform",
};

// Typed explicitly rather than with Next's generated `LayoutProps<"/">` global.
// That global only exists after `next typegen`/`next build` has written
// `.next/types`, so `tsc --noEmit` passed locally off a stale build directory
// and failed in CI, where typecheck deliberately runs before the build. Every
// other route in this app already declares its own props; this matches them and
// keeps typecheck hermetic.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={geistSans.variable}>
      <body>{children}</body>
    </html>
  );
}
