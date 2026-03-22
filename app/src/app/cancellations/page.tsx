"use client";

import StaticPage from "@/components/StaticPage";
import { ShieldX, UserX, Clock, AlertTriangle } from "lucide-react";

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
                    <li>
                        Once a booking is confirmed, it is <strong>final and non-refundable</strong>
                        .
                    </li>
                    <li>
                        We do not offer cancellations, refunds, or rescheduling for any reason,
                        including personal emergencies or changes in plans.
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
                        Refunds are only applicable if your booking was made with an{" "}
                        <strong>Early Bird Offer</strong> and only if the cancellation request is
                        made <strong>at least 48 hours before the event</strong>.
                    </li>
                    <li>
                        If 48 hours have passed or the booking was not an early bird offer,{" "}
                        <strong>no refund will be processed</strong>.
                    </li>
                    <li>
                        Approved refunds are processed back to the original payment method (Bank
                        Account / UPI / Card) within <strong>5–7 business days</strong> from the
                        date of approval.
                    </li>
                </ul>
            </section>
        </StaticPage>
    );
}
