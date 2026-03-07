import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "About Us | Only Workshop",
    description:
        "Learn about Only Workshop — our mission to connect creative professionals with curious learners through curated workshop experiences.",
    openGraph: {
        title: "About Only Workshop",
        description:
            "Connecting creative professionals with curious learners through curated workshop experiences.",
    },
};

export default function AboutLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return children;
}
