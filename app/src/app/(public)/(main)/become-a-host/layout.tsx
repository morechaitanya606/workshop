import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";

export const metadata: Metadata = {
    title: "Become a Host | Only Workshops",
    description:
        "Apply to host workshops on Only Workshops and start accepting creative event bookings.",
    alternates: {
        canonical: getAbsoluteUrl("/become-a-host"),
    },
};

export default function BecomeAHostLayout({ children }: { children: React.ReactNode }) {
    return children;
}
