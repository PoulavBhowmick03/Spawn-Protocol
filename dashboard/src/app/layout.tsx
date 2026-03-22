import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ChainProvider } from "@/context/ChainContext";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Spawn Protocol — DAO Governance Agent Swarm",
  description:
    "Real-time dashboard for the Spawn Protocol autonomous DAO governance agent swarm on Base Sepolia.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body
        className="min-h-full bg-[#0a0a0f] text-[#f0f0f5]"
        suppressHydrationWarning
      >
        <ChainProvider>
          <Navbar />
          <main className="md:ml-56 pt-14 md:pt-0 min-h-screen grid-bg">{children}</main>
        </ChainProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
