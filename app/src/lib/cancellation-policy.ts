export const CANCELLATION_POLICY = {
    listingLeadTimeDays: 7,
    earlyBirdWindowDaysAfterListing: 2,
    earlyBirdRefundPercent: 80,
    noCancellationCutoffHoursBeforeWorkshop: 48,
    generalSummary:
        "Bookings are generally non-refundable, except where the cancellation policy below allows otherwise.",
    earlyBirdSummary:
        "If you booked during the Early Bird window and submit your cancellation request more than 48 hours before the workshop starts, you may be eligible for up to 80% refund of the booking amount.",
    manualReviewSummary:
        "After the Early Bird window closes, cancellation and refund requests made more than 48 hours before the workshop may still be reviewed case by case, but approval is not guaranteed.",
    noCancellationSummary:
        "Within 48 hours of the workshop start time, no cancellation, refund, or reschedule request will be processed.",
    hostCancellationSummary: "If a host cancels, you receive a full refund.",
    refundProcessingWindow: "5 to 7 business days",
} as const;
