import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Navbar } from "@/components/Navbar";
import { ChainProvider } from "@/context/ChainContext";

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
        className="min-h-full flex bg-[#0a0a0f] text-[#f0f0f5]"
        suppressHydrationWarning
      >
        <ChainProvider>
          <Navbar />
          <main className="flex-1 ml-56 min-h-screen grid-bg">{children}</main>
        </ChainProvider>
      </body>
    </html>
  );
}
