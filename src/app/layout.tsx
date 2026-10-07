import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { ToastProvider } from "@/components/toast";

// Runs before hydration so the page never flashes the wrong theme: an
// explicit choice from the toggle wins, otherwise fall back to the OS
// preference. Kept inline (not in theme-toggle.tsx) so it ships with zero
// dependency on React having loaded yet.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('theme');
    var isDark = stored === 'dark' || (stored !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', isDark);
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "C0MM4ND3R — Commander deckbuilder",
  description: "Build and tune Magic: The Gathering Commander decks with live Scryfall data.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Set per request by src/proxy.ts; the CSP only lets scripts with this nonce run.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Plain blocking script (not next/script) as the very first body
            child — runs synchronously during HTML parsing, before anything
            paints, so the page never flashes the wrong theme. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <ToastProvider>
          <SiteHeader />
          <main className="flex-1">{children}</main>
        </ToastProvider>
      </body>
    </html>
  );
}
