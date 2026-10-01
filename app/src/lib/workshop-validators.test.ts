import { describe, expect, it } from "vitest";
import { workshopCreateSchema, workshopUpdateSchema } from "@/lib/validators";

const FUTURE = "2099-06-10";

function validBase(overrides: Record<string, unknown> = {}) {
    return {
        title: "Pottery for beginners",
        description: "Learn the wheel and take home a handmade bowl.",
        category: "Pottery",
        price: 1500,
        location: "Studio 12",
        city: "Pune",
        duration: "3 hours",
        maxSeats: 12,
        coverImage: "/images/cover.webp",
        whatYouLearn: ["Centering clay"],
        materialsProvided: ["Clay"],
        hostName: "Asha Rao",
        hostBio: "Potter with ten years of experience.",
        ...overrides,
    };
}

function issuePaths(result: { success: boolean; error?: { issues: Array<{ path: unknown[] }> } }) {
    return (result.error?.issues ?? []).map((issue) => issue.path.join("."));
}

describe("workshopCreateSchema sessions", () => {
    it("accepts several sessions on the same and different days", () => {
        const result = workshopCreateSchema.safeParse(
            validBase({
                sessions: [
                    { date: FUTURE, time: "10:00" },
                    { date: FUTURE, time: "15:00", maxSeats: 6 },
                    { date: "2099-06-17", time: "10:00" },
                ],
            })
        );
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.sessions).toEqual([
            { date: FUTURE, time: "10:00", maxSeats: 12 },
            { date: FUTURE, time: "15:00", maxSeats: 6 },
            { date: "2099-06-17", time: "10:00", maxSeats: 12 },
        ]);
        // date/time mirror the first session for single-slot consumers.
        expect(result.data.date).toBe(FUTURE);
        expect(result.data.time).toBe("10:00");
    });

    it("keeps backward compatibility with a single date and time", () => {
        const result = workshopCreateSchema.safeParse(
            validBase({ date: FUTURE, time: "09:30:00" })
        );
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.sessions).toEqual([{ date: FUTURE, time: "09:30", maxSeats: 12 }]);
    });

    it("prefers sessions when both forms are sent", () => {
        const result = workshopCreateSchema.safeParse(
            validBase({
                date: "2099-01-01",
                time: "08:00",
                sessions: [{ date: FUTURE, time: "10:00" }],
            })
        );
        expect(result.success).toBe(true);
        if (!result.success) return;
        expect(result.data.sessions).toHaveLength(1);
        expect(result.data.date).toBe(FUTURE);
    });

    it("requires at least one session", () => {
        expect(workshopCreateSchema.safeParse(validBase()).success).toBe(false);
        const empty = workshopCreateSchema.safeParse(validBase({ sessions: [] }));
        expect(empty.success).toBe(false);
        expect(issuePaths(empty)).toContain("sessions");
    });

    it("rejects more than 20 sessions", () => {
        const sessions = Array.from({ length: 21 }, (_, i) => ({
            date: `2099-07-${String(i + 1).padStart(2, "0")}`,
            time: "10:00",
        }));
        expect(workshopCreateSchema.safeParse(validBase({ sessions })).success).toBe(false);
    });

    it("rejects duplicate date+time pairs and points at the later slot", () => {
        const result = workshopCreateSchema.safeParse(
            validBase({
                sessions: [
                    { date: FUTURE, time: "10:00" },
                    { date: FUTURE, time: "11:00" },
                    { date: FUTURE, time: "10:00" },
                ],
            })
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain("sessions.2.time");
    });

    it("rejects sessions in the past (IST)", () => {
        const result = workshopCreateSchema.safeParse(
            validBase({ sessions: [{ date: "2020-01-01", time: "10:00" }] })
        );
        expect(result.success).toBe(false);
        expect(issuePaths(result)).toContain("sessions.0.date");
    });

    it("is strict about the date and time format on write", () => {
        for (const bad of [
            { date: "10/06/2099", time: "10:00" },
            { date: "2099-6-10", time: "10:00" },
            { date: "2099-02-30", time: "10:00" },
            { date: FUTURE, time: "7:00 PM" },
            { date: FUTURE, time: "7:00" },
            { date: FUTURE, time: "25:00" },
        ]) {
            const result = workshopCreateSchema.safeParse(validBase({ sessions: [bad] }));
            expect(result.success).toBe(false);
        }
        expect(
            workshopCreateSchema.safeParse(validBase({ date: FUTURE, time: "7:00 PM" })).success
        ).toBe(false);
    });

    it("validates per-session seat counts", () => {
        expect(
            workshopCreateSchema.safeParse(
                validBase({ sessions: [{ date: FUTURE, time: "10:00", maxSeats: 0 }] })
            ).success
        ).toBe(false);
        expect(
            workshopCreateSchema.safeParse(
                validBase({ sessions: [{ date: FUTURE, time: "10:00", maxSeats: "" }] })
            ).success
        ).toBe(true);
    });
});

describe("workshopUpdateSchema date and time", () => {
    it("normalises valid values and rejects free-form ones", () => {
        const ok = workshopUpdateSchema.safeParse({ date: FUTURE, time: "19:00:00" });
        expect(ok.success).toBe(true);
        if (ok.success) expect(ok.data.time).toBe("19:00");

        expect(workshopUpdateSchema.safeParse({ time: "7:00 PM" }).success).toBe(false);
        expect(workshopUpdateSchema.safeParse({ date: "June 10" }).success).toBe(false);
    });

    it("does not reject an unchanged past date when editing", () => {
        expect(workshopUpdateSchema.safeParse({ date: "2020-01-01" }).success).toBe(true);
    });
});
