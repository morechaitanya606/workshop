// @vitest-environment node
import { renderToString } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuth } from "@/lib/auth-context";
import { metadata } from "./layout";
import BecomeAHostPage from "./page";

// Hoisted with the mock below: layout.tsx builds its canonical at import time.
const { SITE_URL } = vi.hoisted(() => ({ SITE_URL: "https://www.onlyworkshops.com" }));

vi.mock("@/lib/env", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/env")>()),
    getAbsoluteUrl: (path = "/") => `${SITE_URL}${path}`,
}));

vi.mock("@/components/Footer", () => ({
    default: () => null,
}));

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push: vi.fn() }),
    usePathname: () => "/become-a-host",
}));

vi.mock("@/lib/auth-context", () => ({
    useAuth: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
    submitHostApplication: vi.fn(),
    toApiErrorMessage: vi.fn(),
}));

function visibleText(html: string) {
    return html
        .replace(/<[^>]+>/g, " ")
        .replace(/&#x27;|&quot;|&amp;/g, " ")
        .replace(/\s+/g, " ")
        .replace(/ ([,.])/g, "$1")
        .trim();
}

describe("BecomeAHostPage server render", () => {
    beforeEach(() => {
        // The server never knows the visitor's session: auth is always still loading there.
        vi.mocked(useAuth).mockReturnValue({
            user: null,
            session: null,
            loading: true,
            role: null,
            roleLoading: true,
        } as unknown as ReturnType<typeof useAuth>);
    });

    it("renders the h1 and the hosting copy while auth is still loading", () => {
        const html = renderToString(<BecomeAHostPage />);

        expect(html).toMatch(/<h1[^>]*>Host a workshop in Pune<\/h1>/);
        expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
        for (const heading of [
            "Who can host",
            "How the application works",
            "What happens after you apply",
            "What hosts manage",
            "Apply to host",
        ]) {
            expect(html).toMatch(new RegExp(`<h2[^>]*>${heading}</h2>`));
        }
        // Only the form waits for auth; it shows its own spinner in the meantime.
        expect(html).toContain("Loading the application form");
        expect(html).not.toContain("<form");
    });

    it("links to the Pune hub, the venue form and the form anchor", () => {
        const html = renderToString(<BecomeAHostPage />);

        expect(html).toContain('href="/workshops/pune"');
        expect(html).toContain('href="/list-your-space"');
        expect(html).toContain('href="#apply"');
        expect(html).toContain('id="apply"');
    });

    it("links each activity the site has covered to its Pune activity page", () => {
        const html = renderToString(<BecomeAHostPage />);

        for (const slug of [
            "pottery",
            "baking",
            "sourdough",
            "chocolate-making",
            "terrarium",
            "cooking-classes",
        ]) {
            expect(html).toContain(`href="/workshops/pune/${slug}"`);
        }
        expect(visibleText(html)).toContain(
            "have so far covered pottery, baking, sourdough, chocolate making, terrariums and cooking."
        );
    });

    it("carries enough server-rendered copy not to be a thin page", () => {
        const words = visibleText(renderToString(<BecomeAHostPage />)).split(" ");

        expect(words.length).toBeGreaterThanOrEqual(300);
    });
});

describe("become-a-host metadata", () => {
    it("has a short Pune title that differs from the h1", () => {
        expect(metadata.title).toBe("Become a Workshop Host in Pune | Only Workshops");
        expect(String(metadata.title).length).toBeLessThanOrEqual(60);
        expect(metadata.title).not.toBe("Host a workshop in Pune");
    });

    it("keeps the canonical and repeats the root Open Graph site name and locale", () => {
        // A page-level openGraph replaces the root layout's whole object.
        expect(metadata.alternates?.canonical).toBe(`${SITE_URL}/become-a-host`);
        expect(metadata.openGraph).toMatchObject({
            url: `${SITE_URL}/become-a-host`,
            siteName: "Only Workshops",
            locale: "en_IN",
        });
    });
});
