import { Mail, PhoneCall } from "lucide-react";
import StaticPage from "@/components/StaticPage";
import { CONTACT_EMAILS, CONTACT_PHONE_NUMBERS } from "@/lib/contact";

export default function ContactPage() {
    return (
        <StaticPage
            title="Contact Us"
            description="Reach out to the Only Workshops team for support, partnerships, or host onboarding."
            icon={<PhoneCall className="h-6 w-6" />}
        >
            <div className="space-y-4">
                <p>
                    For workshop queries, booking help, partnerships, or host onboarding, use the
                    contact details below and our team will guide you.
                </p>
                <p>
                    For the fastest response, email us with your workshop name, booking issue, or
                    partnership requirement.
                </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl border border-clay/30 bg-cream/60 p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-terracotta shadow-soft">
                        <PhoneCall className="h-5 w-5" />
                    </div>
                    <h2 className="heading-sm mb-3">Call Us</h2>
                    <div className="space-y-3">
                        {CONTACT_PHONE_NUMBERS.map((phone) => (
                            <div key={phone.value} className="rounded-2xl bg-white px-4 py-3">
                                <p className="font-inter text-sm font-semibold text-dark">
                                    {phone.label}
                                </p>
                                <p className="mt-1 text-sm font-inter text-dark-muted">
                                    {phone.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="rounded-2xl border border-clay/30 bg-cream/60 p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-terracotta shadow-soft">
                        <Mail className="h-5 w-5" />
                    </div>
                    <h2 className="heading-sm mb-3">Email Us</h2>
                    <div className="space-y-3">
                        {CONTACT_EMAILS.map((email) => (
                            <div key={email.value} className="rounded-2xl bg-white px-4 py-3">
                                <a
                                    href={`mailto:${email.value}`}
                                    className="font-inter text-sm font-semibold text-terracotta transition-colors hover:text-terracotta-600"
                                >
                                    {email.label}
                                </a>
                                <p className="mt-1 text-sm font-inter text-dark-muted">
                                    {email.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </StaticPage>
    );
}
