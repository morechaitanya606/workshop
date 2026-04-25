import StaticPage from "@/components/StaticPage";

export const metadata = {
    title: "Blog | Only Workshops",
    description: "Stories, hosting lessons, and creative community updates from Only Workshops.",
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
