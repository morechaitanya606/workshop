import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Admin Panel | Only Workshop",
    description: "Manage workshops, bookings, and analytics.",
    robots: { index: false, follow: false },
};

export default function AdminLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
