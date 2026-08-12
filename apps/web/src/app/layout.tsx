import type { Metadata } from "next";
import { IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import type { ReactNode } from "react";

import { MotionProvider } from "@/components/motion-provider";

import "./globals.css";

const instrumentSans = Instrument_Sans({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-sans",
});

const ibmPlexMono = IBM_Plex_Mono({
  display: "swap",
  subsets: ["latin"],
  variable: "--font-mono",
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Hooky — durable webhooks for local development",
  description:
    "Capture webhooks in the cloud and deliver them when your local environment is ready.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      className={`${instrumentSans.variable} ${ibmPlexMono.variable}`}
      data-scroll-behavior="smooth"
      lang="en"
    >
      <body>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
