import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "About Us | Only Workshops",
    description:
        "Learn about Only Workshops — our mission to connect creative professionals with curious learners through curated workshop experiences.",
    openGraph: {
        title: "About Only Workshops",
        description:
            "Connecting creative professionals with curious learners through curated workshop experiences.",
    },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
    return children;
}
