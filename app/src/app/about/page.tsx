import StaticPage from "@/components/StaticPage";
import { Compass, HeartHandshake, ShieldCheck } from "lucide-react";

export default function AboutPage() {
    return (
        <StaticPage
            title="About Only Workshops"
            description="Only Workshops helps people discover and book high-quality creative experiences in their city."
            icon={<Compass className="h-5 w-5" aria-hidden />}
        >
            <section>
                <h2 className="heading-sm mb-2">Our Story</h2>
                <p>
                    Only Workshops started to make weekends more meaningful through hands-on
                    creative experiences. We connect people with local hosts who teach practical
                    skills in welcoming venues.
                </p>
            </section>
            <section>
                <h2 className="heading-sm mb-2">What We Value</h2>
                <p>
                    We focus on quality, community, and accessibility. Every workshop should feel
                    beginner-friendly, thoughtfully hosted, and worth recommending to a friend.
                </p>
            </section>
            <section>
                <h2 className="heading-sm mb-2">How We Vet Hosts</h2>
                <p>
                    Hosts are reviewed for teaching clarity, venue readiness, and attendee feedback
                    before they are promoted broadly on the platform.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-inter font-semibold text-emerald-800">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
                    Quality checks are ongoing after launch.
                </div>
            </section>
            <section>
                <h2 className="heading-sm mb-2">Community First</h2>
                <p>
                    We design for repeat discovery and long-term learning, not one-off bookings.
                    Hosts and attendees grow together through recurring formats and feedback loops.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 text-sm font-inter text-dark-secondary">
                    <HeartHandshake className="h-4 w-4 text-terracotta" aria-hidden />
                    Built for creators and curious learners.
                </div>
            </section>
        </StaticPage>
    );
}
