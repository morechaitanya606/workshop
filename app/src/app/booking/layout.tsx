import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Book a Workshop | Only Workshop",
    description:
        "Complete your booking for a creative workshop experience. Secure checkout with Razorpay.",
    robots: { index: false, follow: false },
};

export default function BookingLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
