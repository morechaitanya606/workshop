import type { Metadata } from "next";
import StaticPage from "@/components/StaticPage";
import { ShieldX, UserX, Clock, AlertTriangle } from "lucide-react";
import { CANCELLATION_POLICY } from "@/lib/cancellation-policy";
import { getAbsoluteUrl } from "@/lib/env";

export const metadata: Metadata = {
    title: "Cancellation & Refund Policy | Only Workshops",
    description:
        "Review cancellation, refund, and rescheduling terms before booking with Only Workshops.",
    alternates: {
        canonical: getAbsoluteUrl("/cancellations"),
    },
};

export default function CancellationsPage() {
    return (
        <StaticPage
            title="Cancellation & Refund Policy"
            description="Please read our cancellation, refund, and rescheduling terms carefully before booking."
            icon={<ShieldX className="w-6 h-6" />}
        >
            <section>
                <div className="flex items-start gap-3 mb-3">
                    <UserX className="w-5 h-5 text-terracotta mt-0.5 shrink-0" />
                    <h2 className="font-playfair text-lg font-bold text-dark">
                        1. Cancellation by Subscriber / User
                    </h2>
                </div>
                <ul className="space-y-2 ml-8 list-disc marker:text-terracotta/40">
                    <li>{CANCELLATION_POLICY.generalSummary}</li>
                    <li>
                        Workshops are typically listed{" "}
                        <strong>
                            {CANCELLATION_POLICY.listingLeadTimeDays} days before the event
                        </strong>
                        , and the <strong>Early Bird window</strong> covers the first{" "}
                        <strong>
                            {CANCELLATION_POLICY.earlyBirdWindowDaysAfterListing} days after the
                            listing goes live
                        </strong>
                        .
                    </li>
                    <li>
                        <strong>{CANCELLATION_POLICY.noCancellationSummary}</strong>
                    </li>
                </ul>
            </section>

            <section>
                <div className="flex items-start gap-3 mb-3">
                    <AlertTriangle className="w-5 h-5 text-terracotta mt-0.5 shrink-0" />
                    <h2 className="font-playfair text-lg font-bold text-dark">
                        2. Cancellation by Host / Only Workshops
                    </h2>
                </div>
                <p>
                    In the unlikely event that a host cancels an event or Only Workshops removes an
                    event due to unforeseen circumstances (e.g., weather, venue issues), all
                    registered attendees will receive a{" "}
                    <strong className="text-emerald-700">100% refund</strong>.
                </p>
            </section>

            <section>
                <div className="flex items-start gap-3 mb-3">
                    <Clock className="w-5 h-5 text-terracotta mt-0.5 shrink-0" />
                    <h2 className="font-playfair text-lg font-bold text-dark">
                        3. Refund Processing Timeline
                    </h2>
                </div>
                <ul className="space-y-2 ml-8 list-disc marker:text-terracotta/40">
                    <li>
                        Approved refunds are processed back to the original payment method (Bank
                        Account / UPI / Card) within{" "}
                        <strong>{CANCELLATION_POLICY.refundProcessingWindow}</strong> from the date
                        of approval.
                    </li>
                    <li>
                        If your request needs manual review, our team will assess it based on the
                        booking window, cancellation timing, and workshop status before confirming
                        whether any refund can be issued.
                    </li>
                </ul>
            </section>
        </StaticPage>
    );
}
