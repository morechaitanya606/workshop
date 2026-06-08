import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import GlobalFloatingWidgets from "@/components/GlobalFloatingWidgets";
import MotionProvider from "@/components/MotionProvider";
import ToastProvider from "@/components/ToastProvider";
import { AuthProvider } from "@/lib/auth-context";
import { getAppUrl } from "@/lib/env";
import { PlatformSettingsProvider } from "@/lib/platform-settings-context";

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

const playfair = Playfair_Display({
    subsets: ["latin"],
    variable: "--font-playfair",
    display: "swap",
    weight: ["400", "500", "600", "700", "800", "900"],
});

const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
    weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
    metadataBase: new URL(getAppUrl()),
    title: "Only Workshops | Discover Creative Workshops Near You",
    description:
        "Book curated creative workshops and experiences happening in your city. Pottery, painting, cooking, and more. A Better Weekend Awaits.",
    keywords: [
        "workshops",
        "creative experiences",
        "pottery class",
        "painting workshop",
        "weekend activities",
        "things to do",
        "craft workshops",
    ],
    openGraph: {
        title: "Only Workshops | A Better Weekend Awaits",
        description: "Discover creative workshops and experiences happening in your city.",
        type: "website",
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
        description: "Discover creative workshops and experiences happening in your city.",
        images: ["/images/og-default.jpg"],
    },
    icons: {
        icon: "/images/icon.png",
        shortcut: "/images/icon.png",
        apple: "/images/icon.png",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en" className={`${playfair.variable} ${inter.variable}`}>
            <body className="min-h-screen bg-cream antialiased">
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
                                <PlatformSettingsProvider>
                                    {children}
                                    <GlobalFloatingWidgets />
                                </PlatformSettingsProvider>
                            </AuthProvider>
                        </ToastProvider>
                    </AnalyticsProvider>
                </MotionProvider>
            </body>
        </html>
    );
}
