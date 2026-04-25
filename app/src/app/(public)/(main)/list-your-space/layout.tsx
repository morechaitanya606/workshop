import type { Metadata } from "next";
import { getAbsoluteUrl } from "@/lib/env";

export const metadata: Metadata = {
    title: "List Your Space | Only Workshops",
    description:
        "Partner with Only Workshops and list your cafe, studio, or venue for curated creative events.",
    alternates: {
        canonical: getAbsoluteUrl("/list-your-space"),
    },
};

export default function ListYourSpaceLayout({ children }: { children: React.ReactNode }) {
    return children;
}
