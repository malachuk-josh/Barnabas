import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_BOOTSTRAP } from "@/components/AppThemeSwitch";
import { TalkProvider } from "@/components/talk/session";

export const metadata: Metadata = {
  title: "Barnabas",
  description: "A voice-first companion for ministry leaders that remembers your people.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "Barnabas", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1e4543",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Young+Serif&display=swap" />
      </head>
      <body>
        {/* The conversation with Barnabas lives here, above the pages, so it carries on as the leader moves around. */}
        <TalkProvider>{children}</TalkProvider>
      </body>
    </html>
  );
}
