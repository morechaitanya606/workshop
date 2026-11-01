import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import GlobalFloatingWidgets from "@/components/GlobalFloatingWidgets";
import MotionProvider from "@/components/MotionProvider";
import SpeedInsights from "@/components/SpeedInsights";
import ToastProvider from "@/components/ToastProvider";
import { AuthProvider } from "@/lib/auth-context";
import { chunkLoadRecoveryScript } from "@/lib/chunk-load-recovery";
import { COOKIE_CONSENT_EVENT, COOKIE_CONSENT_KEY } from "@/lib/cookie-consent";
import { getAppUrl, getGaMeasurementId } from "@/lib/env";
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

const googleSiteVerification = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION?.trim();

// Google Analytics 4, only once the owner sets NEXT_PUBLIC_GA_MEASUREMENT_ID in Vercel.
const gaMeasurementId = getGaMeasurementId();

/**
 * Loads gtag.js only after the visitor accepts cookies: the banner promises "Analytics only runs
 * if you accept", the same rule AnalyticsProvider applies to PostHog. Declining later switches
 * it off for the rest of the visit. The consent check mirrors parseCookieConsent ("true" is what
 * the first banner stored). The id is safe to inline: env.ts only accepts G- plus capitals and
 * digits.
 *
 * Page views are sent here, not by GA4: its own page view (and its history-based ones) carry the
 * full address, query string included, and the query strings on this site hold booking holds,
 * coupon codes, OAuth codes and login redirects. Like stripUrlQuery in analytics.ts for PostHog,
 * the address sent is origin + path only. DEPLOYMENT.md has the GA4 stream settings that go with
 * this (history page views off, query parameter redaction for GA4's other automatic events).
 */
function googleAnalyticsLoader(measurementId: string) {
    return `
(() => {
  const id = ${JSON.stringify(measurementId)};
  let started = false;
  let lastPath = "";

  function bareUrl(rawUrl) {
    if (!rawUrl) return "";
    try {
      const url = new URL(rawUrl, location.href);
      return url.origin + url.pathname;
    } catch {
      return String(rawUrl).split(/[?#]/)[0];
    }
  }

  // One page view per path: a query-only change (Explore filters, booking steps) is not a new
  // page. "set" makes GA4's later automatic events carry the bare address too.
  function pageView() {
    const path = location.pathname;
    if (path === lastPath) return;
    const page = {
      page_location: location.origin + path,
      page_referrer: lastPath ? location.origin + lastPath : bareUrl(document.referrer),
      page_title: document.title,
    };
    lastPath = path;
    window.gtag("set", page);
    window.gtag("event", "page_view", page);
  }

  // Client-side navigations go through history.pushState/replaceState (or back/forward). The
  // page view waits a tick so document.title already belongs to the new page.
  function watchNavigations() {
    const later = () => setTimeout(pageView, 0);
    ["pushState", "replaceState"].forEach((method) => {
      const original = history[method];
      history[method] = function (...args) {
        const result = original.apply(this, args);
        later();
        return result;
      };
    });
    window.addEventListener("popstate", later);
  }

  function storedConsent() {
    try {
      const value = localStorage.getItem(${JSON.stringify(COOKIE_CONSENT_KEY)});
      if (value === "accepted" || value === "true") return "accepted";
      return value === "declined" ? "declined" : null;
    } catch {
      return null;
    }
  }

  function start() {
    started = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    // Measurement only: nothing here is used for ads.
    window.gtag("consent", "default", {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    window.gtag("js", new Date());
    window.gtag("config", id, { send_page_view: false });
    pageView();
    watchNavigations();
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(id);
    document.head.appendChild(script);
  }

  function apply(consent) {
    if (consent !== "accepted" && consent !== "declined") return;
    const granted = consent === "accepted";
    window["ga-disable-" + id] = !granted;
    if (started) {
      window.gtag("consent", "update", { analytics_storage: granted ? "granted" : "denied" });
    } else if (granted) {
      start();
    }
  }

  apply(storedConsent());
  window.addEventListener(${JSON.stringify(COOKIE_CONSENT_EVENT)}, (event) => {
    apply((event && event.detail) || storedConsent());
  });
})();
`;
}

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
                {gaMeasurementId && (
                    // lazyOnload: runs in browser idle time after the load event, so it never
                    // competes with the hero image (LCP) or with hydration, which is what makes
                    // the first taps slow (INP) on phones. A visit that leaves before then is
                    // simply not counted.
                    <Script
                        id="ga4-loader"
                        strategy="lazyOnload"
                        dangerouslySetInnerHTML={{ __html: googleAnalyticsLoader(gaMeasurementId) }}
                    />
                )}
            </body>
        </html>
    );
}
