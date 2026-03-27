import { describe, expect, it } from "vitest";
import {
    buildChatbotFaqDocument,
    DEFAULT_CHATBOT_SIMILARITY_THRESHOLD,
    isChatbotMatchBelowThreshold,
    toVectorLiteral,
} from "@/lib/chatbot-vector-search";

describe("chatbot vector search helpers", () => {
    it("formats faq documents for passage embeddings", () => {
        expect(buildChatbotFaqDocument("What is the fee?", "The fee is Rs. 999.")).toContain("Q:");
        expect(buildChatbotFaqDocument("What is the fee?", "The fee is Rs. 999.")).toContain("A:");
    });

    it("detects threshold failures and serializes vectors", () => {
        expect(isChatbotMatchBelowThreshold([])).toBe(true);
        expect(
            isChatbotMatchBelowThreshold([
                { similarity: DEFAULT_CHATBOT_SIMILARITY_THRESHOLD - 0.01 },
            ])
        ).toBe(true);
        expect(
            isChatbotMatchBelowThreshold([
                { similarity: DEFAULT_CHATBOT_SIMILARITY_THRESHOLD + 0.05 },
            ])
        ).toBe(false);
        expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe("[0.1,0.2,0.3]");
    });
});
