import type { Metadata } from "next";
import StaticPage from "@/components/StaticPage";
import { getAbsoluteUrl } from "@/lib/env";

export const metadata: Metadata = {
    title: "Blog | Only Workshops",
    description: "Stories, hosting lessons, and creative community updates from Only Workshops.",
    alternates: {
        canonical: getAbsoluteUrl("/blog"),
    },
    // A "coming soon" placeholder: keep it out of search results until it has real content.
    robots: { index: false, follow: true },
};

export default function BlogPage() {
    return (
        <StaticPage
            title="Only Workshops Blog"
            description="We are preparing articles on workshop hosting, creative communities, and standout event formats."
        >
            <section>
                <h2 className="font-playfair text-lg font-bold text-dark mb-3">Coming Soon</h2>
                <p>
                    The blog will feature launch notes, host spotlights, and practical playbooks for
                    building memorable offline experiences.
                </p>
            </section>
        </StaticPage>
    );
}
