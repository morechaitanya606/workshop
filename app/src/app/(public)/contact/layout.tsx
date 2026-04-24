import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Contact | Only Workshops",
    description:
        "Get in touch with the Only Workshops team. We are here to help with booking questions, hosting enquiries, and partnerships.",
    openGraph: {
        title: "Contact Only Workshops",
        description: "Reach out to us for any questions or collaborations.",
    },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
    return children;
}
