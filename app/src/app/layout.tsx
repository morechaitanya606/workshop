import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import AnalyticsProvider from "@/components/AnalyticsProvider";
import MotionProvider from "@/components/MotionProvider";
import ToastProvider from "@/components/ToastProvider";
import { AuthProvider } from "@/lib/auth-context";
import SupportChatbot from "@/components/SupportChatbot";
import CookieConsentBanner from "@/components/CookieConsentBanner";
import { getAppUrl } from "@/lib/env";

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
                <MotionProvider>
                    <AnalyticsProvider>
                        <ToastProvider>
                            <AuthProvider>
                                {children}
                                <SupportChatbot />
                                <CookieConsentBanner />
                            </AuthProvider>
                        </ToastProvider>
                    </AnalyticsProvider>
                </MotionProvider>
            </body>
        </html>
    );
}
