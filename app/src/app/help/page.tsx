import Link from "next/link";
import { CalendarCheck, CircleUserRound, LifeBuoy, Store } from "lucide-react";
import StaticPage from "@/components/StaticPage";
import { CONTACT_EMAILS, CONTACT_PHONE_NUMBERS, CONTACT_PAGE_HREF } from "@/lib/contact";

export default function HelpPage() {
    return (
        <StaticPage
            title="Help Center"
            description="Get quick help with bookings, account access, payments, and hosting. If you still need us, our support team is easy to reach."
            icon={<LifeBuoy className="h-6 w-6" aria-hidden />}
            alignment="center"
        >
            <div className="space-y-4">
                <p>
                    Start with the section that matches your issue. We usually reply fastest when
                    you include your workshop name, booking date, and the email or phone number used
                    during checkout.
                </p>
            </div>

            <div className="grid gap-4 text-left md:grid-cols-3">
                <div className="rounded-2xl border border-clay/30 bg-cream/60 p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-terracotta shadow-soft">
                        <CalendarCheck className="h-5 w-5" aria-hidden />
                    </div>
                    <h2 className="heading-sm mb-2">Booking Help</h2>
                    <p className="text-sm text-dark-muted">
                        Need to confirm a seat, change plans, or understand a payment issue? Share
                        your workshop details and booking name with us.
                    </p>
                </div>

                <div className="rounded-2xl border border-clay/30 bg-cream/60 p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-terracotta shadow-soft">
                        <CircleUserRound className="h-5 w-5" aria-hidden />
                    </div>
                    <h2 className="heading-sm mb-2">Account Help</h2>
                    <p className="text-sm text-dark-muted">
                        If you are stuck signing in, updating profile details, or finding past
                        bookings, contact us from your registered email for a quicker resolution.
                    </p>
                </div>

                <div className="rounded-2xl border border-clay/30 bg-cream/60 p-5">
                    <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-terracotta shadow-soft">
                        <Store className="h-5 w-5" aria-hidden />
                    </div>
                    <h2 className="heading-sm mb-2">Host Help</h2>
                    <p className="text-sm text-dark-muted">
                        Hosts can reach out for onboarding, workshop updates, payouts, or support
                        with listings and attendee management.
                    </p>
                </div>
            </div>

            <section className="space-y-3 text-left">
                <h2 className="heading-sm">Before You Contact Us</h2>
                <ul className="list-disc space-y-2 pl-5 text-sm text-dark-muted">
                    <li>
                        Include your booking name and workshop date if the issue is booking-related.
                    </li>
                    <li>
                        Use the email linked to your account when asking for login or profile help.
                    </li>
                    <li>Attach screenshots for payment errors or unexpected checkout messages.</li>
                </ul>
            </section>

            <section className="space-y-4">
                <h2 className="heading-sm">Still Need Support?</h2>
                <div className="grid gap-4 text-left md:grid-cols-2">
                    <div className="rounded-2xl border border-clay/30 bg-cream/60 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta">
                            Email
                        </p>
                        <div className="mt-3 space-y-3">
                            {CONTACT_EMAILS.map((email) => (
                                <div key={email.value} className="rounded-2xl bg-white px-4 py-3">
                                    <a
                                        href={`mailto:${email.value}`}
                                        className="font-inter text-sm font-semibold text-terracotta transition-colors hover:text-terracotta-600"
                                    >
                                        {email.label}
                                    </a>
                                    <p className="mt-1 text-sm text-dark-muted">
                                        {email.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-clay/30 bg-cream/60 p-5">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-terracotta">
                            Phone
                        </p>
                        <div className="mt-3 space-y-3">
                            {CONTACT_PHONE_NUMBERS.map((phone) => (
                                <div key={phone.value} className="rounded-2xl bg-white px-4 py-3">
                                    <a
                                        href={`tel:${phone.value}`}
                                        className="font-inter text-sm font-semibold text-terracotta transition-colors hover:text-terracotta-600"
                                    >
                                        {phone.label}
                                    </a>
                                    <p className="mt-1 text-sm text-dark-muted">
                                        {phone.description}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div>
                    <Link href={CONTACT_PAGE_HREF} className="btn-secondary">
                        Open Contact Page
                    </Link>
                </div>
            </section>
        </StaticPage>
    );
}
