export const SUPPORT_CHAT_CACHE_TTL_MS = 60_000;
export const SUPPORT_CHAT_LIST_LIMIT = 3;
export const SUPPORT_CHAT_PROVIDER_WORKSHOP_LIMIT = 3;

export const SUPPORT_CHAT_MATCH_THRESHOLDS = {
    detailHighConfidence: 24,
    detailExactTitleBonus: 48,
    detailExactIdBonus: 52,
    listResultMinimum: 1,
};

export const SUPPORT_CHAT_ANALYTICS_EVENTS = {
    answered: "chat_answered",
    clarificationNeeded: "chat_clarification_needed",
    issueFormOpened: "chat_issue_form_opened",
    noMatch: "chat_no_match",
} as const;

export const SUPPORT_CHAT_POLICY = {
    booking: {
        callToAction: "Reserve Spot",
        holdWindowMinutes: 10,
        confirmationText: "Once payment succeeds, your booking is confirmed instantly.",
    },
    cancellation: {
        fullRefundWindowHours: 24,
        refundProcessingWindow: "5 to 7 business days",
    },
    payment: {
        providerName: "Razorpay",
        autoRefundWindow: "5 to 7 business days",
    },
} as const;

export const SUPPORT_CHAT_MESSAGES = {
    greeting:
        "Hi! I can help you find workshops, explain what each session includes, and answer booking, cancellation, or payment questions.",
    clarification:
        "I can help with that, but I need a bit more detail. Tell me the workshop name, category, date, city, or budget and I will narrow it down.",
    clarificationEscalation:
        "I still could not confidently match that to a workshop or support request. Please use the form below and our team will help directly.",
    issueForm:
        "It sounds like you need direct support. Please use the form below and share the details so the team can follow up properly.",
    browseFallback:
        "I could not find a confident workshop match for that right now. Tell me the workshop name, category, date, city, or budget and I will narrow it down.",
    unknown:
        'I can help with workshop details, pricing, materials, timing, location, booking, cancellation, and payment. Try asking something like "Tell me about the pottery workshop" or "What workshops are available this week?"',
    issueFormIntro:
        "Please fill out the form below and share the issue details. The support team will review it and follow up.",
    issueSubmitted: "Issue submitted successfully. Our team will review it and get back to you.",
    issueSubmissionFailed: "Sorry, something went wrong. Please try again or email us directly.",
    issueSubmissionNetworkError: "Network error. Please check your connection and try again.",
    thinking: "Looking that up...",
} as const;
