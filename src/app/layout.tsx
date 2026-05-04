import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";

import "./globals.css";

const sans = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "AEGIS | AI Operations Command",
  description: "Mobile-first AI operations app for multi-tenant workspaces.",
};

export const viewport: Viewport = {
  themeColor: "#090b16",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sans.variable} ${mono.variable} h-full bg-[var(--bg-primary)] text-[var(--text-primary)] antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
