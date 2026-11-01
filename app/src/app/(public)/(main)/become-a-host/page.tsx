import Link from "next/link";
import { ArrowDown, ArrowLeft, ArrowRight } from "lucide-react";
import Footer from "@/components/Footer";
import { CONTACT_EMAILS } from "@/lib/contact";
import { getSeoCityByName } from "@/lib/seo";
import { getSeoTopicBySlug, topicPagePath } from "@/lib/seo-topics";
import BecomeAHostForm from "./BecomeAHostForm";

/*
 * Server component: the heading and the copy below are in the HTML that crawlers and phones get
 * first. Only the form waits for the signed-in account (BecomeAHostForm). Every statement here
 * mirrors what the code does: /api/host-applications (submit, resubmit), the admin approve and
 * reject routes, and the host area under (private)/host. Keep it that way when the flow changes.
 * Server-only on purpose: it reads lib/seo-topics, which must never reach a client module.
 */

const HOST_CONTACT_EMAIL = CONTACT_EMAILS[0];

/**
 * Activities workshops on the site have covered so far (past or listed sessions), linked to their
 * Pune activity pages. A slug that stops resolving simply drops out of the sentence.
 */
const PUNE = getSeoCityByName("Pune");
const COVERED_ACTIVITIES = [
    { slug: "pottery", label: "pottery" },
    { slug: "baking", label: "baking" },
    { slug: "sourdough", label: "sourdough" },
    { slug: "chocolate-making", label: "chocolate making" },
    { slug: "terrarium", label: "terrariums" },
    { slug: "cooking-classes", label: "cooking" },
].flatMap(({ slug, label }) => {
    const topic = getSeoTopicBySlug(slug);
    return PUNE && topic ? [{ label, href: topicPagePath(PUNE, topic) }] : [];
});

const sectionClassName =
    "rounded-2xl border-l-4 border-terracotta/20 bg-white/70 p-6 pl-5 shadow-soft";

const APPLICATION_STEPS = [
    "Sign in to your Only Workshops account, or create one. The form fills in the name and email saved on your account.",
    "Add your mobile number, your field of expertise, the area you are based in, and a short bio about your experience and teaching style.",
    "Add a portfolio, Instagram, YouTube or website link if you have one. These are optional.",
    "Submit the form. A confirmation appears on this page once your application is received.",
];

const HOST_TOOLS = [
    {
        title: "Workshops.",
        description:
            "Submit a workshop with its description, price, venue, seats, photos and one or more date and time slots, and add an early bird discount if you want one. Each workshop stays pending until our team approves it, and then it appears on the website.",
    },
    {
        title: "Changes and repeats.",
        description:
            "Edit a workshop while it is pending or not approved, or duplicate an earlier one to start a new workshop from its details.",
    },
    {
        title: "Bookings and check-in.",
        description:
            "See how many seats are booked for each workshop, and check attendees in from its attendee list.",
    },
    {
        title: "Earnings.",
        description: "Follow your workshop earnings and payout history.",
    },
    {
        title: "Attendee support.",
        description:
            "Reply to support tickets from your attendees, and set up a chatbot with answers to common questions.",
    },
];

export default function BecomeAHostPage() {
    return (
        <div className="min-h-full bg-cream text-dark">
            <section className="pt-28 pb-8 md:pb-16 section-padding">
                <div className="max-w-2xl mx-auto">
                    <Link
                        href="/"
                        className="interactive-link mb-6 inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta"
                    >
                        <ArrowLeft className="w-4 h-4" aria-hidden />
                        Back to Home
                    </Link>

                    <header className="mb-8">
                        <p className="eyebrow-label">For hosts</p>
                        <h1 className="heading-lg mb-4">Host a workshop in Pune</h1>
                        <p className="text-body mb-6">
                            Only Workshops is where people in Pune find and book hands-on creative
                            workshops. If you teach a craft or skill and want to run your own
                            sessions, you can apply to host here. Our team reviews every
                            application, and approved hosts get a Host Panel to submit workshops,
                            follow bookings and check attendees in.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <a href="#apply" className="btn-primary !py-3 !px-6 text-sm">
                                Apply to host
                                <ArrowDown className="w-4 h-4" aria-hidden />
                            </a>
                            <Link
                                href="/workshops/pune"
                                className="btn-secondary !py-3 !px-6 text-sm"
                            >
                                See workshops in Pune
                                <ArrowRight className="w-4 h-4" aria-hidden />
                            </Link>
                        </div>
                    </header>

                    <div className="space-y-5 text-body">
                        <section className={sectionClassName}>
                            <h2 className="heading-sm mb-2">Who can host</h2>
                            <p className="mb-3">
                                Hosting suits creative professionals, teachers and studio owners who
                                can guide a group through a hands-on session.
                                {COVERED_ACTIVITIES.length > 0 && (
                                    <>
                                        {" "}
                                        Workshops on Only Workshops have so far covered{" "}
                                        {COVERED_ACTIVITIES.map((activity, index) => (
                                            <span key={activity.href}>
                                                {index > 0 &&
                                                    (index === COVERED_ACTIVITIES.length - 1
                                                        ? " and "
                                                        : ", ")}
                                                <Link
                                                    href={activity.href}
                                                    className="font-semibold text-terracotta hover:underline"
                                                >
                                                    {activity.label}
                                                </Link>
                                            </span>
                                        ))}
                                        .
                                    </>
                                )}{" "}
                                The application asks for your own field of expertise rather than a
                                fixed list of subjects.
                            </p>
                            <p>
                                Have a cafe, studio or venue to offer rather than a workshop to
                                teach?{" "}
                                <Link
                                    href="/list-your-space"
                                    className="font-semibold text-terracotta hover:underline"
                                >
                                    List your space
                                </Link>{" "}
                                instead.
                            </p>
                        </section>

                        <section className={sectionClassName}>
                            <h2 className="heading-sm mb-3">How the application works</h2>
                            <ol className="list-decimal space-y-2 pl-5">
                                {APPLICATION_STEPS.map((step) => (
                                    <li key={step}>{step}</li>
                                ))}
                            </ol>
                        </section>

                        <section className={sectionClassName}>
                            <h2 className="heading-sm mb-2">What happens after you apply</h2>
                            <p className="mb-3">
                                Your application goes to the Only Workshops team, who approve or
                                reject it from the admin dashboard. Once it is approved, your
                                account becomes a host account and a Host Panel link appears in the
                                menu when you are signed in.
                            </p>
                            <p>
                                If your application is not approved, you can update your details and
                                submit the form again for a fresh review. Sending the form again
                                while you wait updates the application you already sent.
                            </p>
                        </section>

                        <section className={sectionClassName}>
                            <h2 className="heading-sm mb-3">What hosts manage</h2>
                            <ul className="space-y-2">
                                {HOST_TOOLS.map((tool) => (
                                    <li key={tool.title}>
                                        <strong className="font-semibold text-dark">
                                            {tool.title}
                                        </strong>{" "}
                                        {tool.description}
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <p className="text-sm font-inter text-dark-muted">
                            Questions before you apply? Email{" "}
                            <a
                                href={`mailto:${HOST_CONTACT_EMAIL.value}`}
                                className="font-semibold text-terracotta hover:underline"
                            >
                                {HOST_CONTACT_EMAIL.label}
                            </a>{" "}
                            or visit the{" "}
                            <Link
                                href="/help"
                                className="font-semibold text-terracotta hover:underline"
                            >
                                Help Center
                            </Link>
                            .
                        </p>
                    </div>

                    <section
                        id="apply"
                        aria-labelledby="apply-heading"
                        className="mt-10 scroll-mt-28 bg-white rounded-2xl border border-gray-200 shadow-soft p-6 sm:p-8"
                    >
                        <h2 id="apply-heading" className="heading-sm mb-2">
                            Apply to host
                        </h2>
                        <p className="text-sm font-inter text-dark-muted mb-6">
                            Fill in the form below. Fields marked optional can be left empty.
                        </p>
                        <BecomeAHostForm />
                    </section>
                </div>
            </section>

            <Footer />
        </div>
    );
}
