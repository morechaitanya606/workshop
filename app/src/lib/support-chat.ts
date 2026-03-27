import * as Sentry from "@sentry/core";
import type { Workshop } from "@/lib/data";
import { mockWorkshops } from "@/lib/data";
import {
    SUPPORT_CHAT_CACHE_TTL_MS,
    SUPPORT_CHAT_LIST_LIMIT,
    SUPPORT_CHAT_MATCH_THRESHOLDS,
    SUPPORT_CHAT_MESSAGES,
    SUPPORT_CHAT_POLICY,
} from "@/lib/support-chat-config";
import { warnDevFallback } from "@/lib/dev-warnings";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";

export type SupportChatReply = {
    reply: string;
    contextWorkshopId: string | null;
    showIssueForm: boolean;
};

export type SupportChatIntent =
    | "booking"
    | "cancellation"
    | "greeting"
    | "issue_report"
    | "payment"
    | "unknown"
    | "workshop_detail"
    | "workshop_list";

export type SupportChatConfidence = "high" | "low";
export type SupportChatOutcome = "answered" | "clarification_needed" | "issue_form";

export type SupportChatResolution = SupportChatReply & {
    intent: SupportChatIntent;
    confidence: SupportChatConfidence;
    outcome: SupportChatOutcome;
};

export type BuildSupportChatReplyOptions = {
    userDisplayName?: string | null;
    contextWorkshopId?: string | null;
    today?: Date;
};

type WorkshopMatch = {
    workshop: Workshop;
    score: number;
    exactIdMatch: boolean;
    exactTitleMatch: boolean;
};

type WorkshopCacheEntry = {
    data: Workshop[];
    fetchedAt: number;
};

const GREETING_KEYWORDS = ["hello", "hi", "hey", "help", "support"];
const BOOKING_KEYWORDS = ["book", "booking", "reserve", "register", "spot", "seat"];
const CANCELLATION_KEYWORDS = ["cancel", "cancellation", "refund", "reschedule"];
const PAYMENT_KEYWORDS = ["payment", "pay", "charged", "charge", "money", "razorpay", "upi"];
const PAYMENT_FAILURE_KEYWORDS = [
    "charged twice",
    "payment failed",
    "transaction failed",
    "money deducted",
    "amount deducted",
    "no booking",
    "no confirmation",
];
const ISSUE_KEYWORDS = [
    "issue",
    "problem",
    "not working",
    "error",
    "bug",
    "complaint",
    "report",
    "support ticket",
    "failed",
];
const WORKSHOP_LIST_KEYWORDS = [
    "workshop",
    "workshops",
    "event",
    "events",
    "class",
    "classes",
    "available",
    "upcoming",
    "recommend",
    "suggest",
    "options",
    "show me",
];
const PRICE_KEYWORDS = ["price", "cost", "fees", "fee", "how much"];
const SCHEDULE_KEYWORDS = ["when", "date", "time", "schedule", "today", "tomorrow", "weekend"];
const LOCATION_KEYWORDS = ["where", "location", "venue", "address"];
const MATERIAL_KEYWORDS = ["material", "materials", "included", "include", "provided", "bring"];
const LEARNING_KEYWORDS = ["learn", "teaches", "teach", "covered", "cover", "curriculum"];
const AVAILABILITY_KEYWORDS = ["available", "availability", "seat", "seats", "spot", "spots"];
const HOST_KEYWORDS = ["host", "instructor", "teacher", "trainer"];
const DURATION_KEYWORDS = ["duration", "how long", "hours", "hour"];
const BEGINNER_KEYWORDS = ["beginner", "experience", "newbie", "prior experience"];
const DETAIL_KEYWORDS = ["about", "details", "detail", "more info", "explain", "tell me"];
const STOPWORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "at",
    "can",
    "for",
    "from",
    "have",
    "i",
    "if",
    "in",
    "is",
    "it",
    "me",
    "my",
    "of",
    "on",
    "please",
    "show",
    "tell",
    "the",
    "this",
    "to",
    "what",
    "when",
    "where",
    "which",
    "with",
    "you",
]);

let workshopCache: WorkshopCacheEntry | null = null;

async function loadLiveSupportChatWorkshopRows(
    serviceClient: ReturnType<typeof createSupabaseServiceClient>,
    includeApprovalFilter = true
) {
    let query = serviceClient.from("workshops").select("*");

    if (includeApprovalFilter) {
        query = query.eq("approval_status", "approved");
    }

    return await query.order("date", { ascending: true }).limit(64);
}

function normalizeText(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim();
}

function tokenize(value: string) {
    return normalizeText(value)
        .split(/\s+/)
        .filter((token) => token && !STOPWORDS.has(token));
}

function includesAny(normalizedQuery: string, keywords: string[]) {
    const paddedQuery = ` ${normalizedQuery} `;
    return keywords.some((keyword) => {
        const normalizedKeyword = normalizeText(keyword);
        return paddedQuery.includes(` ${normalizedKeyword} `);
    });
}

function formatDate(dateValue: string) {
    const parsed = new Date(`${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) {
        return dateValue;
    }

    return new Intl.DateTimeFormat("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
    }).format(parsed);
}

function formatTime(timeValue: string) {
    const [hoursRaw, minutesRaw] = timeValue.split(":");
    const hours = Number(hoursRaw);
    const minutes = Number(minutesRaw);

    if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        return timeValue;
    }

    const date = new Date();
    date.setHours(hours, minutes, 0, 0);

    return new Intl.DateTimeFormat("en-IN", {
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function formatPrice(amount: number) {
    return `Rs. ${new Intl.NumberFormat("en-IN").format(amount)}`;
}

function toIsoDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

function humanJoin(items: string[], limit = 3) {
    const uniqueItems = Array.from(
        new Set(items.map((item) => item.trim()).filter((item) => item.length > 0))
    ).slice(0, limit);

    if (uniqueItems.length === 0) return "";
    if (uniqueItems.length === 1) return uniqueItems[0];
    if (uniqueItems.length === 2) return `${uniqueItems[0]} and ${uniqueItems[1]}`;

    const head = uniqueItems.slice(0, -1).join(", ");
    const tail = uniqueItems[uniqueItems.length - 1];
    return `${head}, and ${tail}`;
}

function getDisplayName(userDisplayName?: string | null) {
    const trimmed = userDisplayName?.trim();
    if (!trimmed) return "";
    return trimmed.split(/\s+/)[0] || "";
}

function getWorkshopSearchText(workshop: Workshop) {
    return normalizeText(
        [
            workshop.id,
            workshop.title,
            workshop.category,
            workshop.location,
            workshop.city,
            workshop.description,
            workshop.hostName,
            workshop.hostBio,
            workshop.whatYouLearn.join(" "),
            workshop.materialsProvided.join(" "),
        ].join(" ")
    );
}

function scoreWorkshopMatch(workshop: Workshop, normalizedQuery: string, queryTokens: string[]) {
    const normalizedTitle = normalizeText(workshop.title);
    const normalizedCategory = normalizeText(workshop.category);
    const normalizedLocation = normalizeText(`${workshop.location} ${workshop.city}`);
    const normalizedHost = normalizeText(workshop.hostName);
    const haystack = getWorkshopSearchText(workshop);

    let score = 0;
    const exactIdMatch = normalizeText(workshop.id) === normalizedQuery;
    const exactTitleMatch = normalizedTitle === normalizedQuery;

    if (exactIdMatch) {
        score += SUPPORT_CHAT_MATCH_THRESHOLDS.detailExactIdBonus;
    }

    if (exactTitleMatch) {
        score += SUPPORT_CHAT_MATCH_THRESHOLDS.detailExactTitleBonus;
    }

    if (
        !exactTitleMatch &&
        normalizedQuery.length > 4 &&
        normalizedTitle.includes(normalizedQuery)
    ) {
        score += 32;
    }

    for (const token of queryTokens) {
        if (normalizedTitle.includes(token)) {
            score += 12;
            continue;
        }
        if (normalizedCategory.includes(token)) {
            score += 10;
            continue;
        }
        if (normalizedLocation.includes(token) || normalizedHost.includes(token)) {
            score += 7;
            continue;
        }
        if (haystack.includes(token)) {
            score += 3;
        }
    }

    return {
        workshop,
        score,
        exactIdMatch,
        exactTitleMatch,
    };
}

function findWorkshopMatches(workshops: Workshop[], query: string) {
    const normalizedQuery = normalizeText(query);
    const queryTokens = tokenize(query);

    if (!normalizedQuery || queryTokens.length === 0) {
        return [] as WorkshopMatch[];
    }

    return workshops
        .map((workshop) => scoreWorkshopMatch(workshop, normalizedQuery, queryTokens))
        .filter((match) => match.score > 0)
        .sort((left, right) => right.score - left.score);
}

function getWorkshopAvailabilityText(workshop: Workshop) {
    if (workshop.seatsRemaining <= 0) {
        return "currently sold out";
    }

    return `${workshop.seatsRemaining} of ${workshop.maxSeats} seats left`;
}

function getRelativeDateWorkshops(workshops: Workshop[], normalizedQuery: string, today: Date) {
    const todayIso = toIsoDate(today);

    if (normalizedQuery.includes("today")) {
        return workshops.filter((workshop) => workshop.date === todayIso);
    }

    if (normalizedQuery.includes("tomorrow")) {
        return workshops.filter((workshop) => workshop.date === toIsoDate(addDays(today, 1)));
    }

    if (normalizedQuery.includes("this week")) {
        const endIso = toIsoDate(addDays(today, 7));
        return workshops.filter((workshop) => workshop.date >= todayIso && workshop.date <= endIso);
    }

    if (normalizedQuery.includes("weekend")) {
        const endIso = toIsoDate(addDays(today, 7));
        return workshops.filter((workshop) => {
            if (workshop.date < todayIso || workshop.date > endIso) {
                return false;
            }

            const weekday = new Date(`${workshop.date}T00:00:00`).getDay();
            return weekday === 0 || weekday === 6;
        });
    }

    return workshops;
}

function getBudgetLimit(normalizedQuery: string) {
    const match = normalizedQuery.match(
        /(?:under|below|less than|max|maximum)\s*(?:rs)?\s*(\d{3,6})/
    );
    if (!match) return null;

    const amount = Number(match[1]);
    return Number.isNaN(amount) ? null : amount;
}

function getRequestedWorkshopCategories(
    workshops: Workshop[],
    normalizedQuery: string,
    queryTokens: string[]
) {
    return new Set(
        workshops
            .map((workshop) => workshop.category.trim())
            .filter((category) => {
                const normalizedCategory = normalizeText(category);
                const categoryTokens = tokenize(category);

                return (
                    normalizedQuery.includes(normalizedCategory) ||
                    categoryTokens.some((token) => queryTokens.includes(token))
                );
            })
    );
}

function getRequestedWorkshopCities(
    workshops: Workshop[],
    normalizedQuery: string,
    queryTokens: string[]
) {
    return new Set(
        workshops
            .map((workshop) => workshop.city.trim())
            .filter((city) => {
                const normalizedCity = normalizeText(city);
                const cityTokens = tokenize(city);

                return (
                    normalizedQuery.includes(normalizedCity) ||
                    cityTokens.some((token) => queryTokens.includes(token))
                );
            })
    );
}

function filterWorkshopList(workshops: Workshop[], query: string, today: Date) {
    const normalizedQuery = normalizeText(query);
    const queryTokens = tokenize(query);
    const todayIso = toIsoDate(today);
    const includePast =
        normalizedQuery.includes("past") ||
        normalizedQuery.includes("previous") ||
        normalizedQuery.includes("ended");

    let items = includePast
        ? [...workshops]
        : workshops.filter((workshop) => {
              if (workshop.date < todayIso) return false;
              if (workshop.date === todayIso) {
                  const [hours, minutes] = workshop.time.split(":");
                  const workshopTime = new Date(today);
                  workshopTime.setHours(Number(hours), Number(minutes), 0, 0);
                  if (workshopTime < today) return false;
              }
              // If query implies availability, filter out sold out items
              if (normalizedQuery.includes("available")) {
                  return workshop.seatsRemaining > 0;
              }
              return workshop.seatsRemaining >= 0;
          });

    items = getRelativeDateWorkshops(items, normalizedQuery, today);

    const budgetLimit = getBudgetLimit(normalizedQuery);
    if (budgetLimit !== null) {
        items = items.filter((workshop) => workshop.price <= budgetLimit);
    }

    const requestedCategories = getRequestedWorkshopCategories(items, normalizedQuery, queryTokens);
    if (requestedCategories.size > 0) {
        items = items.filter((workshop) => requestedCategories.has(workshop.category.trim()));
    }

    const requestedCities = getRequestedWorkshopCities(items, normalizedQuery, queryTokens);
    if (requestedCities.size > 0) {
        items = items.filter((workshop) => requestedCities.has(workshop.city.trim()));
    }

    const matched = findWorkshopMatches(items, query);
    if (matched.length > 0) {
        return matched.map((match) => match.workshop);
    }

    return items.sort((left, right) => left.date.localeCompare(right.date));
}

function buildWorkshopSummary(workshop: Workshop) {
    return `${workshop.title} is a ${workshop.duration} ${workshop.category.toLowerCase()} workshop at ${workshop.location} on ${formatDate(workshop.date)} at ${formatTime(workshop.time)}.`;
}

function buildWorkshopLink(workshop: Workshop, label = "View workshop") {
    return `[${label}](/workshop/${encodeURIComponent(workshop.id)})`;
}

function buildWorkshopDetailReply(query: string, workshop: Workshop) {
    const normalizedQuery = normalizeText(query);
    const wantsPrice = includesAny(normalizedQuery, PRICE_KEYWORDS);
    const wantsSchedule = includesAny(normalizedQuery, SCHEDULE_KEYWORDS);
    const wantsLocation = includesAny(normalizedQuery, LOCATION_KEYWORDS);
    const wantsMaterials = includesAny(normalizedQuery, MATERIAL_KEYWORDS);
    const wantsLearning = includesAny(normalizedQuery, LEARNING_KEYWORDS);
    const wantsAvailability = includesAny(normalizedQuery, AVAILABILITY_KEYWORDS);
    const wantsHost = includesAny(normalizedQuery, HOST_KEYWORDS);
    const wantsDuration = includesAny(normalizedQuery, DURATION_KEYWORDS);
    const wantsBeginner = includesAny(normalizedQuery, BEGINNER_KEYWORDS);
    const wantsDetails = includesAny(normalizedQuery, DETAIL_KEYWORDS);

    const parts: string[] = [];

    if (
        wantsDetails ||
        (!wantsPrice &&
            !wantsSchedule &&
            !wantsLocation &&
            !wantsMaterials &&
            !wantsLearning &&
            !wantsAvailability &&
            !wantsHost &&
            !wantsDuration &&
            !wantsBeginner)
    ) {
        parts.push(buildWorkshopSummary(workshop));
        parts.push(
            `It costs ${formatPrice(workshop.price)}, is ${getWorkshopAvailabilityText(workshop)}, and is hosted by ${workshop.hostName}.`
        );
        parts.push(`You will learn ${humanJoin(workshop.whatYouLearn)}.`);
        parts.push(`Materials included: ${humanJoin(workshop.materialsProvided)}.`);
        parts.push(`Open it here: ${buildWorkshopLink(workshop)}.`);
        return parts.join(" ");
    }

    if (wantsPrice) {
        parts.push(`${workshop.title} costs ${formatPrice(workshop.price)} per booking.`);
    }

    if (wantsSchedule || wantsDuration) {
        parts.push(
            `${workshop.title} is scheduled for ${formatDate(workshop.date)} at ${formatTime(workshop.time)} and runs for ${workshop.duration}.`
        );
    }

    if (wantsLocation) {
        const place =
            workshop.city && workshop.city !== workshop.location
                ? `${workshop.location}, ${workshop.city}`
                : workshop.location;
        parts.push(`${workshop.title} takes place at ${place}.`);
    }

    if (wantsMaterials) {
        parts.push(
            `For ${workshop.title}, the host provides ${humanJoin(workshop.materialsProvided, 4)}. Comfortable clothes are a good idea for hands-on sessions.`
        );
    }

    if (wantsLearning) {
        parts.push(`In ${workshop.title}, you will learn ${humanJoin(workshop.whatYouLearn)}.`);
    }

    if (wantsAvailability) {
        parts.push(`${workshop.title} is ${getWorkshopAvailabilityText(workshop)}.`);
    }

    if (wantsHost) {
        parts.push(`${workshop.title} is hosted by ${workshop.hostName}. ${workshop.hostBio}`);
    }

    if (wantsBeginner) {
        const beginnerFriendly = /beginner|step by step|intro|intimate|basics/i.test(
            `${workshop.title} ${workshop.description}`
        );
        parts.push(
            beginnerFriendly
                ? `${workshop.title} looks beginner-friendly, and the host guides attendees through the session.`
                : `${workshop.title} is a guided workshop. If you want, I can also tell you what is covered and what materials are included.`
        );
    }

    parts.push(`Open it here: ${buildWorkshopLink(workshop)}.`);
    return parts.join(" ");
}

function buildCategoryExploreLink(category: string) {
    return `/explore?category=${encodeURIComponent(category)}&page=1&pageSize=8`;
}

function getDominantWorkshopCategory(workshops: Workshop[]) {
    const categories = Array.from(new Set(workshops.map((workshop) => workshop.category.trim())));
    return categories.length === 1 ? categories[0] : null;
}

function buildWorkshopListReply(
    workshops: Workshop[],
    userDisplayName?: string | null,
    originalQuery?: string
) {
    const name = getDisplayName(userDisplayName);
    const isPastQuery = originalQuery
        ? originalQuery.includes("past") ||
          originalQuery.includes("previous") ||
          originalQuery.includes("ended")
        : false;

    const intro = name
        ? `${name}, here are ${isPastQuery ? "some past workshops" : "the best workshop matches I found right now"}:`
        : `Here are ${isPastQuery ? "some past workshops" : "the best workshop matches I found right now"}:`;

    const lines = workshops.slice(0, SUPPORT_CHAT_LIST_LIMIT).map((workshop, index) => {
        return `${index + 1}. ${workshop.title} - ${formatDate(workshop.date)} at ${formatTime(workshop.time)} - ${formatPrice(workshop.price)} - ${workshop.location} - ${getWorkshopAvailabilityText(workshop)}. ${buildWorkshopLink(workshop)}.`;
    });

    const dominantCategory = getDominantWorkshopCategory(workshops);
    const categoryLink =
        dominantCategory && !isPastQuery
            ? ` You can browse more here: [Explore ${dominantCategory}](${buildCategoryExploreLink(dominantCategory)}).`
            : "";
    const closing = isPastQuery
        ? "You can view photos and details of these and other previous experiences on our [Past Events](/past-events) page."
        : workshops.length > SUPPORT_CHAT_LIST_LIMIT
          ? `If you want, I can narrow this down further by category, date, budget, or workshop name.${categoryLink}`
          : `Ask me about any one of these and I can explain the schedule, price, host, materials, or what you will learn.${categoryLink}`;

    return [intro, ...lines, closing].join("\n");
}

function buildGreetingReply(userDisplayName?: string | null) {
    const name = getDisplayName(userDisplayName);
    if (!name) {
        return SUPPORT_CHAT_MESSAGES.greeting;
    }

    return `Hi ${name}! ${SUPPORT_CHAT_MESSAGES.greeting.replace(/^Hi!\s*/, "")}`;
}

function buildBookingReply(workshop?: Workshop) {
    const action = SUPPORT_CHAT_POLICY.booking.callToAction;
    const holdMinutes = SUPPORT_CHAT_POLICY.booking.holdWindowMinutes;
    const confirmation = SUPPORT_CHAT_POLICY.booking.confirmationText;

    if (workshop) {
        return `You can book ${workshop.title} from its workshop page. Choose your guest count, click ${action}, and complete payment within ${holdMinutes} minutes. ${confirmation}`;
    }

    return `To book a workshop, open the workshop page, choose the number of guests, and click ${action}. You will have ${holdMinutes} minutes to complete payment, and ${confirmation.toLowerCase()}`;
}

function buildCancellationReply() {
    return `${SUPPORT_CHAT_POLICY.cancellation.generalSummary} Workshops usually go live ${SUPPORT_CHAT_POLICY.cancellation.listingLeadTimeDays} days before the session, and the Early Bird booking window lasts for the first ${SUPPORT_CHAT_POLICY.cancellation.earlyBirdWindowDaysAfterListing} days after listing. If an Early Bird booking is cancelled at least ${SUPPORT_CHAT_POLICY.cancellation.noRefundCutoffHoursBeforeWorkshop} hours before the workshop, up to ${SUPPORT_CHAT_POLICY.cancellation.earlyBirdRefundPercent}% of the booking amount may be refunded. ${SUPPORT_CHAT_POLICY.cancellation.manualReviewSummary} ${SUPPORT_CHAT_POLICY.cancellation.noCancellationSummary} ${SUPPORT_CHAT_POLICY.cancellation.hostCancellationSummary} Approved refunds usually take ${SUPPORT_CHAT_POLICY.cancellation.refundProcessingWindow}.`;
}

function buildPaymentReply() {
    return `If a payment fails or you are charged without a confirmation, ${SUPPORT_CHAT_POLICY.payment.providerName} usually verifies the payment before the booking is created. If money was deducted but no booking shows up, the amount is typically auto-refunded within ${SUPPORT_CHAT_POLICY.payment.autoRefundWindow}.`;
}

function buildClarificationReply(matches: WorkshopMatch[], userDisplayName?: string | null) {
    const name = getDisplayName(userDisplayName);
    const prefix = name ? `${name}, ` : "";

    if (matches.length >= 2) {
        return `${prefix}I found a few possible matches. Tell me which workshop you mean: ${matches
            .slice(0, 2)
            .map((match) => match.workshop.title)
            .join(" or ")}. You can also mention the category, date, city, or budget.`;
    }

    return `${prefix}${SUPPORT_CHAT_MESSAGES.clarification}`;
}

function buildIssueFormReply() {
    return SUPPORT_CHAT_MESSAGES.issueForm;
}

function looksLikeGreeting(queryTokens: string[], normalizedQuery: string) {
    if (!normalizedQuery || queryTokens.length === 0 || queryTokens.length > 3) {
        return false;
    }

    return queryTokens.every((token) => GREETING_KEYWORDS.includes(token));
}

function findContextWorkshop(workshops: Workshop[], contextWorkshopId?: string | null) {
    if (!contextWorkshopId) return null;
    return workshops.find((workshop) => workshop.id === contextWorkshopId) || null;
}

function hasExplicitWorkshopReference(
    queryTokens: string[],
    topMatch: WorkshopMatch | null,
    sharedFilterTokens: Set<string>
) {
    if (!topMatch) {
        return false;
    }

    const workshopTokens = tokenize(
        `${topMatch.workshop.title} ${topMatch.workshop.category} ${topMatch.workshop.location} ${topMatch.workshop.hostName}`
    ).filter((token) => token.length > 3 && !sharedFilterTokens.has(token));

    return workshopTokens.some((token) => queryTokens.includes(token));
}

function shouldUseWorkshopContext(normalizedQuery: string) {
    return (
        includesAny(normalizedQuery, PRICE_KEYWORDS) ||
        includesAny(normalizedQuery, SCHEDULE_KEYWORDS) ||
        includesAny(normalizedQuery, LOCATION_KEYWORDS) ||
        includesAny(normalizedQuery, MATERIAL_KEYWORDS) ||
        includesAny(normalizedQuery, LEARNING_KEYWORDS) ||
        includesAny(normalizedQuery, AVAILABILITY_KEYWORDS) ||
        includesAny(normalizedQuery, HOST_KEYWORDS) ||
        includesAny(normalizedQuery, DURATION_KEYWORDS) ||
        includesAny(normalizedQuery, BEGINNER_KEYWORDS) ||
        includesAny(normalizedQuery, DETAIL_KEYWORDS)
    );
}

function hasPaymentFailureIntent(normalizedQuery: string) {
    return (
        includesAny(normalizedQuery, PAYMENT_KEYWORDS) &&
        includesAny(normalizedQuery, [...ISSUE_KEYWORDS, ...PAYMENT_FAILURE_KEYWORDS])
    );
}

function hasIssueIntent(normalizedQuery: string) {
    return (
        includesAny(normalizedQuery, ISSUE_KEYWORDS) &&
        !includesAny(normalizedQuery, WORKSHOP_LIST_KEYWORDS)
    );
}

function classifyIntent(input: {
    normalizedQuery: string;
    queryTokens: string[];
    contextWorkshop: Workshop | null;
    topMatch: WorkshopMatch | null;
    workshops: Workshop[];
}) {
    const { normalizedQuery, queryTokens, contextWorkshop, topMatch, workshops } = input;
    const categoryTokens = new Set(
        workshops.flatMap((workshop) => tokenize(`${workshop.category} ${workshop.city}`))
    );
    const explicitWorkshopReference = hasExplicitWorkshopReference(
        queryTokens,
        topMatch,
        categoryTokens
    );
    const isExplicitList =
        includesAny(normalizedQuery, WORKSHOP_LIST_KEYWORDS) ||
        normalizedQuery.includes("today") ||
        normalizedQuery.includes("tomorrow") ||
        normalizedQuery.includes("weekend") ||
        normalizedQuery.includes("this week");

    const workshopListHint =
        isExplicitList ||
        getBudgetLimit(normalizedQuery) !== null ||
        queryTokens.some((token) => categoryTokens.has(token));

    if (hasPaymentFailureIntent(normalizedQuery) || hasIssueIntent(normalizedQuery)) {
        return "issue_report" as const;
    }

    if (includesAny(normalizedQuery, BOOKING_KEYWORDS)) {
        return "booking" as const;
    }

    if (includesAny(normalizedQuery, CANCELLATION_KEYWORDS)) {
        return "cancellation" as const;
    }

    if (includesAny(normalizedQuery, PAYMENT_KEYWORDS)) {
        return "payment" as const;
    }

    if (looksLikeGreeting(queryTokens, normalizedQuery)) {
        return "greeting" as const;
    }

    if (isExplicitList && !explicitWorkshopReference) {
        return "workshop_list" as const;
    }

    if (
        contextWorkshop &&
        shouldUseWorkshopContext(normalizedQuery) &&
        !explicitWorkshopReference
    ) {
        return "workshop_detail" as const;
    }

    if (topMatch && (explicitWorkshopReference || shouldUseWorkshopContext(normalizedQuery))) {
        return "workshop_detail" as const;
    }

    if (workshopListHint) {
        return "workshop_list" as const;
    }

    return "unknown" as const;
}

function resolveWorkshopDetail(
    message: string,
    contextWorkshop: Workshop | null,
    topMatch: WorkshopMatch | null
): SupportChatResolution | null {
    if (
        contextWorkshop &&
        shouldUseWorkshopContext(normalizeText(message)) &&
        !hasExplicitWorkshopReference(
            tokenize(message),
            topMatch,
            new Set(tokenize(`${contextWorkshop.category} ${contextWorkshop.city}`))
        )
    ) {
        return {
            reply: buildWorkshopDetailReply(message, contextWorkshop),
            contextWorkshopId: contextWorkshop.id,
            showIssueForm: false,
            intent: "workshop_detail",
            confidence: "high",
            outcome: "answered",
        };
    }

    if (
        topMatch &&
        (topMatch.exactIdMatch ||
            topMatch.exactTitleMatch ||
            topMatch.score >= SUPPORT_CHAT_MATCH_THRESHOLDS.detailHighConfidence)
    ) {
        return {
            reply: buildWorkshopDetailReply(message, topMatch.workshop),
            contextWorkshopId: topMatch.workshop.id,
            showIssueForm: false,
            intent: "workshop_detail",
            confidence: "high",
            outcome: "answered",
        };
    }

    return null;
}

export function resolveSupportChatReply(
    message: string,
    workshops: Workshop[],
    options: BuildSupportChatReplyOptions = {}
): SupportChatResolution {
    const normalizedQuery = normalizeText(message);
    const queryTokens = tokenize(message);
    const today = options.today ?? new Date();
    const contextWorkshop = findContextWorkshop(workshops, options.contextWorkshopId);
    const matches = findWorkshopMatches(workshops, message);
    const topMatch = matches[0] || null;
    const intent = classifyIntent({
        normalizedQuery,
        queryTokens,
        contextWorkshop,
        topMatch,
        workshops,
    });

    if (!normalizedQuery) {
        return {
            reply: buildGreetingReply(options.userDisplayName),
            contextWorkshopId: options.contextWorkshopId ?? null,
            showIssueForm: false,
            intent: "greeting",
            confidence: "high",
            outcome: "answered",
        };
    }

    if (intent === "issue_report") {
        return {
            reply: buildIssueFormReply(),
            contextWorkshopId: options.contextWorkshopId ?? null,
            showIssueForm: true,
            intent,
            confidence: "high",
            outcome: "issue_form",
        };
    }

    if (intent === "greeting") {
        return {
            reply: buildGreetingReply(options.userDisplayName),
            contextWorkshopId: options.contextWorkshopId ?? null,
            showIssueForm: false,
            intent,
            confidence: "high",
            outcome: "answered",
        };
    }

    const strongMatch =
        topMatch &&
        (topMatch.exactIdMatch ||
            topMatch.exactTitleMatch ||
            topMatch.score >= SUPPORT_CHAT_MATCH_THRESHOLDS.detailHighConfidence)
            ? topMatch.workshop
            : undefined;

    if (intent === "booking") {
        return {
            reply: buildBookingReply(strongMatch || contextWorkshop || undefined),
            contextWorkshopId: strongMatch?.id || contextWorkshop?.id || null,
            showIssueForm: false,
            intent,
            confidence: "high",
            outcome: "answered",
        };
    }

    if (intent === "cancellation") {
        return {
            reply: buildCancellationReply(),
            contextWorkshopId: strongMatch?.id || contextWorkshop?.id || null,
            showIssueForm: false,
            intent,
            confidence: "high",
            outcome: "answered",
        };
    }

    if (intent === "payment") {
        return {
            reply: buildPaymentReply(),
            contextWorkshopId: strongMatch?.id || contextWorkshop?.id || null,
            showIssueForm: false,
            intent,
            confidence: "high",
            outcome: "answered",
        };
    }

    if (intent === "workshop_detail") {
        const detailReply = resolveWorkshopDetail(message, contextWorkshop, topMatch);
        if (detailReply) {
            return detailReply;
        }

        return {
            reply: buildClarificationReply(matches, options.userDisplayName),
            contextWorkshopId: options.contextWorkshopId ?? null,
            showIssueForm: false,
            intent,
            confidence: "low",
            outcome: "clarification_needed",
        };
    }

    if (intent === "workshop_list") {
        const workshopList = filterWorkshopList(workshops, message, today);
        if (workshopList.length >= SUPPORT_CHAT_MATCH_THRESHOLDS.listResultMinimum) {
            return {
                reply: buildWorkshopListReply(
                    workshopList,
                    options.userDisplayName,
                    normalizedQuery
                ),
                contextWorkshopId: workshopList[0]?.id || null,
                showIssueForm: false,
                intent,
                confidence: "high",
                outcome: "answered",
            };
        }

        return {
            reply:
                matches.length > 0
                    ? buildClarificationReply(matches, options.userDisplayName)
                    : SUPPORT_CHAT_MESSAGES.browseFallback,
            contextWorkshopId: null,
            showIssueForm: false,
            intent,
            confidence: "low",
            outcome: "clarification_needed",
        };
    }

    return {
        reply: buildClarificationReply(matches, options.userDisplayName),
        contextWorkshopId: options.contextWorkshopId ?? null,
        showIssueForm: false,
        intent: "unknown",
        confidence: "low",
        outcome: "clarification_needed",
    };
}

export function buildSupportChatReply(
    message: string,
    workshops: Workshop[],
    options: BuildSupportChatReplyOptions = {}
): SupportChatReply {
    const resolved = resolveSupportChatReply(message, workshops, options);
    return {
        reply: resolved.reply,
        contextWorkshopId: resolved.contextWorkshopId,
        showIssueForm: resolved.showIssueForm,
    };
}

export async function loadSupportChatWorkshops(now = Date.now()) {
    if (workshopCache && now - workshopCache.fetchedAt < SUPPORT_CHAT_CACHE_TTL_MS) {
        return workshopCache.data;
    }

    if (isSupabaseServiceConfigured) {
        try {
            const serviceClient = createSupabaseServiceClient({ requestTimeoutMs: 5000 });
            let { data, error } = await loadLiveSupportChatWorkshopRows(serviceClient);

            if (error && isMissingApprovalStatusColumnError(error)) {
                ({ data, error } = await loadLiveSupportChatWorkshopRows(serviceClient, false));
            }

            if (!error && data) {
                const mapped = data.map((row) => mapWorkshopRowToWorkshop(row));
                workshopCache = {
                    data: mapped,
                    fetchedAt: now,
                };
                return mapped;
            }
            if (error) {
                Sentry.captureException(error, {
                    tags: {
                        layer: "support_chat",
                        route: "load_support_chat_workshops",
                    },
                });
            }
        } catch (error) {
            Sentry.captureException(error, {
                tags: {
                    layer: "support_chat",
                    route: "load_support_chat_workshops",
                },
            });
        }
    }

    if (workshopCache) {
        return workshopCache.data;
    }

    warnDevFallback(
        "support_chat",
        "Using mock workshop data because support chat could not load live workshops."
    );

    workshopCache = {
        data: mockWorkshops,
        fetchedAt: now,
    };
    return mockWorkshops;
}
