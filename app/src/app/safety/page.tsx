import StaticPage from "@/components/StaticPage";
import { ShieldCheck, TriangleAlert, LifeBuoy } from "lucide-react";

export default function SafetyPage() {
    return (
        <StaticPage
            title="Safety"
            description="We work with workshop hosts to promote safe, respectful in-person experiences."
            icon={<ShieldCheck className="h-5 w-5" aria-hidden />}
        >
            <section>
                <h2 className="heading-sm mb-2">Before You Book</h2>
                <p>
                    Check the workshop details, venue address, and any age or accessibility notes.
                    Reach out to support if anything is unclear before confirming payment.
                </p>
            </section>
            <section>
                <h2 className="heading-sm mb-2">During the Workshop</h2>
                <p>
                    Hosts are expected to maintain a respectful environment, share safety
                    instructions clearly, and keep group sizes within venue limits.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-inter font-semibold text-amber-900">
                    <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
                    Leave immediately if you feel unsafe and contact us.
                </div>
            </section>
            <section>
                <h2 className="heading-sm mb-2">Report a Concern</h2>
                <p>
                    If a venue, host, or attendee behavior violates our standards, contact support
                    with the booking ID and a short description so we can investigate promptly.
                </p>
                <div className="mt-3 inline-flex items-center gap-2 text-sm font-inter text-dark-secondary">
                    <LifeBuoy className="h-4 w-4 text-terracotta" aria-hidden />
                    Support response targets same-day acknowledgement.
                </div>
            </section>
        </StaticPage>
    );
}
