import type { Metadata } from "next";
import { Playfair_Display, Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

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
    title: "Only Workshop | Discover Creative Workshops Near You",
    description:
        "Book curated creative workshops and experiences happening in your city. Pottery, painting, cooking, and more — A Better Weekend Awaits.",
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
        title: "Only Workshop | A Better Weekend Awaits",
        description:
            "Discover creative workshops and experiences happening in your city.",
        type: "website",
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
                <AuthProvider>
                    {children}
                </AuthProvider>
            </body>
        </html>
    );
}
