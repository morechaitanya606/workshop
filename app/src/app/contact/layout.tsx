import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Contact | Only Workshop",
    description:
        "Get in touch with the Only Workshop team. We are here to help with booking questions, hosting enquiries, and partnerships.",
    openGraph: {
        title: "Contact Only Workshop",
        description: "Reach out to us for any questions or collaborations.",
    },
};

export default function ContactLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
