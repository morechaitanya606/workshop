import { describe, expect, it } from "vitest";
import type { Workshop } from "@/lib/data";
import { mockWorkshops, workshopImages } from "@/lib/data";
import { SUPPORT_CHAT_POLICY } from "@/lib/support-chat-config";
import { resolveSupportChatReply } from "@/lib/support-chat";

const FIXED_TODAY = new Date("2026-03-14T00:00:00Z");

function buildWorkshop(overrides: Partial<Workshop> = {}): Workshop {
    return {
        id: "new-workshop",
        title: "Beginner Candle Pouring Lab",
        description:
            "Learn how to blend fragrance oils, pour wax safely, and leave with your own custom candle.",
        category: "Arts & Crafts",
        price: 1600,
        location: "Maker Studio",
        city: "Bengaluru",
        duration: "2 hours",
        date: "2026-03-18",
        time: "18:30",
        maxSeats: 14,
        seatsRemaining: 6,
        coverImage: workshopImages.workshop18,
        galleryImages: [workshopImages.workshop18, workshopImages.workshop19],
        rating: 4.8,
        reviewCount: 0,
        hostName: "Naina Kapoor",
        hostAvatar: workshopImages.whatsapp1,
        hostBio: "Fragrance artist helping beginners learn wax, scent, and candle care.",
        whatYouLearn: ["Wax pouring", "Fragrance blending", "Wick placement"],
        materialsProvided: ["Soy wax", "Fragrance oils", "Glass jar", "Apron"],
        ...overrides,
    };
}

describe("resolveSupportChatReply", () => {
    it("returns a personalized workshop list for general discovery questions", () => {
        const result = resolveSupportChatReply("What workshops are available?", mockWorkshops, {
            userDisplayName: "Chait",
            today: FIXED_TODAY,
        });

        expect(result.reply).toContain("Chait");
        expect(result.reply).toContain("1.");
        expect(result.reply).toContain("Intro to Wheel Throwing");
        expect(result.intent).toBe("workshop_list");
        expect(result.outcome).toBe("answered");
    });

    it("returns workshop-specific details when a workshop can be matched", () => {
        const result = resolveSupportChatReply(
            "Tell me about the wheel throwing workshop",
            mockWorkshops,
            {
                today: FIXED_TODAY,
            }
        );

        expect(result.reply).toContain("Intro to Wheel Throwing");
        expect(result.reply).toContain("Rs. 1,500");
        expect(result.contextWorkshopId).toBe("1");
        expect(result.intent).toBe("workshop_detail");
        expect(result.confidence).toBe("high");
    });

    it("uses the active workshop context for follow-up questions", () => {
        const result = resolveSupportChatReply("What materials are included?", mockWorkshops, {
            contextWorkshopId: "1",
            today: FIXED_TODAY,
        });

        expect(result.reply).toContain("For Intro to Wheel Throwing");
        expect(result.reply).toContain("Aprons provided");
        expect(result.contextWorkshopId).toBe("1");
        expect(result.outcome).toBe("answered");
    });

    it("uses structured booking policy values in booking answers", () => {
        const result = resolveSupportChatReply("How do I book a workshop?", mockWorkshops, {
            today: FIXED_TODAY,
        });

        expect(result.reply).toContain(SUPPORT_CHAT_POLICY.booking.callToAction);
        expect(result.reply).toContain(String(SUPPORT_CHAT_POLICY.booking.holdWindowMinutes));
        expect(result.intent).toBe("booking");
    });

    it("opens the issue form for explicit payment failure reports", () => {
        const result = resolveSupportChatReply(
            "My payment failed and money got deducted but there is no booking",
            mockWorkshops,
            {
                today: FIXED_TODAY,
            }
        );

        expect(result.showIssueForm).toBe(true);
        expect(result.intent).toBe("issue_report");
        expect(result.outcome).toBe("issue_form");
    });

    it("asks for clarification when the question is too ambiguous", () => {
        const result = resolveSupportChatReply("I want something fun", mockWorkshops, {
            today: FIXED_TODAY,
        });

        expect(result.outcome).toBe("clarification_needed");
        expect(result.confidence).toBe("low");
        expect(result.reply).toContain("Tell me");
    });

    it("can answer newly added workshops without any retraining step", () => {
        const workshops = [buildWorkshop(), ...mockWorkshops];

        const result = resolveSupportChatReply("Tell me about the candle pouring lab", workshops, {
            today: FIXED_TODAY,
        });

        expect(result.reply).toContain("Beginner Candle Pouring Lab");
        expect(result.contextWorkshopId).toBe("new-workshop");
        expect(result.outcome).toBe("answered");
    });
});
