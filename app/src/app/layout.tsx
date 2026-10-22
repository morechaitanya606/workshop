import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import GlobalFloatingWidgets from "@/components/GlobalFloatingWidgets";
import MotionProvider from "@/components/MotionProvider";
import SpeedInsights from "@/components/SpeedInsights";
import ToastProvider from "@/components/ToastProvider";
import { AuthProvider } from "@/lib/auth-context";
import { getAppUrl } from "@/lib/env";
import { PlatformSettingsProvider } from "@/lib/platform-settings-context";
import { getCachedPlatformSettings } from "@/lib/cached-reads";
import { SITE_NAME } from "@/lib/seo";

// Self-hosted by next/font at build time (no runtime request to Google). The CSS variables are
// the ones tailwind.config.ts maps `font-inter` / `font-playfair` / `font-display` onto.
const inter = Inter({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-inter",
});

// Upright only: the italic files were preloaded on every page, but only the summer retreat page
// sets Playfair in italic, and it loads its own copy with the italic.
const playfair = Playfair_Display({
    subsets: ["latin"],
    display: "swap",
    variable: "--font-playfair",
});

const chunkLoadRecoveryScript = `
(() => {
  const storageKey = "onlyworkshops:chunk-recovery";

  function messageFrom(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value.message) return String(value.message);
    if (value.reason) return messageFrom(value.reason);
    if (value.error) return messageFrom(value.error);
    return String(value);
  }

  function isChunkLoadError(value) {
    const message = messageFrom(value).toLowerCase();
    return (
      message.includes("chunkloaderror") ||
      message.includes("loading chunk") ||
      message.includes("failed to fetch dynamically imported module") ||
      message.includes("error loading dynamically imported module") ||
      message.includes("/_next/static/chunks/")
    );
  }

  function recover(value) {
    if (!isChunkLoadError(value)) return;

    const marker = [location.pathname, location.search, Date.now()].join("|");
    let previous = "";
    try {
      previous = sessionStorage.getItem(storageKey) || "";
    } catch {
      previous = "";
    }

    const previousTime = Number(previous.split("|").pop() || 0);

    if (Date.now() - previousTime < 10000) return;

    try {
      sessionStorage.setItem(storageKey, marker);
    } catch {}

    location.reload();
  }

  window.addEventListener("error", (event) => recover(event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => recover(event.reason));
})();
`;

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

export const metadata: Metadata = {
    metadataBase: new URL(getAppUrl()),
    title: "Only Workshops | Creative Workshops & Events in Pune",
    description:
        "Book curated creative workshops and experiences in Pune: pottery, baking, cooking and more, with local makers. A Better Weekend Awaits.",
    openGraph: {
        title: "Only Workshops | A Better Weekend Awaits",
        description: "Discover creative workshops and experiences happening in Pune.",
        type: "website",
        siteName: SITE_NAME,
        locale: "en_IN",
        images: [
            {
                url: "/images/og-default.jpg",
                width: 1200,
                height: 630,
                alt: "Only Workshops social preview",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "Only Workshops | A Better Weekend Awaits",
        description: "Discover creative workshops and experiences happening in Pune.",
        images: ["/images/og-default.jpg"],
    },
    // Search Console ownership tag, emitted only once the owner sets the variable in Vercel.
    ...(googleSiteVerification ? { verification: { google: googleSiteVerification } } : {}),
    icons: {
        icon: "/images/icon.png",
        shortcut: "/images/icon.png",
        apple: "/images/icon.png",
    },
};

export default async function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    const settings = await getCachedPlatformSettings();

    return (
        <html lang="en-IN" className={`${inter.variable} ${playfair.variable}`}>
            <body className="min-h-screen bg-cream antialiased" suppressHydrationWarning>
                <script dangerouslySetInnerHTML={{ __html: chunkLoadRecoveryScript }} />
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-full focus:bg-terracotta focus:px-6 focus:py-3 focus:text-white focus:font-inter focus:font-semibold focus:shadow-lg"
                >
                    Skip to content
                </a>
                <MotionProvider>
                    <AnalyticsProvider>
                        <ToastProvider>
                            <AuthProvider>
                                <PlatformSettingsProvider initialSettings={settings}>
                                    {children}
                                    <GlobalFloatingWidgets />
                                </PlatformSettingsProvider>
                            </AuthProvider>
                        </ToastProvider>
                    </AnalyticsProvider>
                </MotionProvider>
                <SpeedInsights />
            </body>
        </html>
    );
}
