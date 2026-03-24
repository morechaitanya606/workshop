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
                        Once a booking is confirmed, it is generally <strong>non-refundable</strong>
                        , except where a specific refund path is stated below (such as the Early
                        Bird refund policy).
                    </li>
                    <li>
                        Workshops are typically listed <strong>7 days before the event</strong>, and
                        the <strong>Early Bird window</strong> covers the first{" "}
                        <strong>2 days after listing goes live</strong>.
                    </li>
                    <li>
                        If you booked during that Early Bird window and submit a cancellation
                        request <strong>only in 24 hours you can cancel </strong>, up to{" "}
                        <strong>80% of the booking amount</strong> may be refunded.
                    </li>
                    <li>
                        After the Early Bird window ends, you may still request a refund if the
                        workshop is more than 48 hours away, but approval is{" "}
                        <strong>case by case and not guaranteed</strong>.
                    </li>
                    <li>
                        Within <strong>48 hours of the workshop start time</strong>, bookings are{" "}
                        <strong>not cancellable and not refundable</strong>.
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
                        Account / UPI / Card) within <strong>5-7 business days</strong> from the
                        date of approval.
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
