import { describe, expect, it } from "vitest";
import { adminWorkshopCreateSchema, workshopCreateSchema } from "@/lib/validators";
import { buildHostKey, buildTemplateKey, normalizeKeyPart } from "@/lib/workshop-library";
import { validateSessionList } from "@/lib/workshop-sessions";

describe("workshop library keys", () => {
    it("ignores case, outer and inner whitespace", () => {
        expect(normalizeKeyPart("  Asha   Patil ")).toBe("asha patil");
        expect(buildHostKey("ASHA patil")).toBe(buildHostKey(" asha  Patil "));
    });

    it("treats the same host, title, city and venue as one template", () => {
        const a = buildTemplateKey({
            hostName: "Asha Patil",
            title: "Pottery Basics",
            city: "Pune",
            location: "Studio 9",
        });
        const b = buildTemplateKey({
            hostName: "asha  patil",
            title: "pottery basics ",
            city: "PUNE",
            location: "studio 9",
        });
        expect(a).toBe(b);
        expect(a).toBe("asha patil|pottery basics|pune|studio 9");
    });

    it("keeps different hosts running the same workshop apart", () => {
        const base = { title: "Pottery Basics", city: "Pune", location: "Studio 9" };
        expect(buildTemplateKey({ hostName: "Asha", ...base })).not.toBe(
            buildTemplateKey({ hostName: "Ravi", ...base })
        );
    });
});

describe("past sessions", () => {
    const now = new Date("2026-10-16T06:30:00.000Z");
    const past = [{ date: "2026-09-01", time: "10:00" }];

    it("are rejected by default", () => {
        expect(validateSessionList(past, now)).toHaveLength(1);
    });

    it("are accepted when past sessions are allowed", () => {
        expect(validateSessionList(past, now, { allowPastSessions: true })).toEqual([]);
    });

    const payload = {
        title: "Pottery Basics",
        description: "A relaxed hands-on pottery session for beginners.",
        category: "Pottery",
        price: 1200,
        location: "Studio 9",
        city: "Pune",
        duration: "2 hours",
        sessions: [{ date: "2020-01-05", time: "10:00" }],
        maxSeats: 10,
        coverImage: "/images/workshops/pottery.webp",
        hostName: "Asha Patil",
        hostBio: "Ceramic artist with ten years of teaching.",
        whatYouLearn: ["Wheel throwing"],
        materialsProvided: ["Clay"],
    };

    it("only the admin create schema lets a past date through", () => {
        expect(workshopCreateSchema.safeParse(payload).success).toBe(false);
        expect(adminWorkshopCreateSchema.safeParse(payload).success).toBe(true);
    });
});
