import { describe, expect, it } from "vitest";
import { ApiClientError, toApiErrorMessage } from "@/lib/api-client";

describe("toApiErrorMessage", () => {
    it("returns API error message when error is ApiClientError", () => {
        const message = toApiErrorMessage(
            new ApiClientError("Server said no.", 400),
            "Fallback error"
        );
        expect(message).toBe("Server said no.");
    });

    it("returns fallback message for unknown errors", () => {
        const message = toApiErrorMessage(new Error("random"), "Fallback error");
        expect(message).toBe("Fallback error");
    });
});
