import StaticPage from "@/components/StaticPage";

export const metadata = {
    title: "Press | Only Workshops",
    description:
        "Press updates, brand background, and media contact information for Only Workshops.",
};

export default function PressPage() {
    return (
        <StaticPage
            title="Press & Media"
            description="We are assembling a lightweight press kit with platform background, launch milestones, and media assets."
        >
            <section>
                <h2 className="font-playfair text-lg font-bold text-dark mb-3">Media Requests</h2>
                <p>
                    For interviews, partnerships, or media questions, please use the contact page
                    and mention that your request is for press coverage.
                </p>
            </section>
        </StaticPage>
    );
}
