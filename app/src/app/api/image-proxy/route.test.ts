import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/rate-limit", () => ({
    enforceRateLimit: vi.fn(),
}));

import { enforceRateLimit } from "@/lib/rate-limit";
import { GET } from "./route";

const OWN_HOST = "ownproject.supabase.co";

function proxyRequest(target: string) {
    return new NextRequest(`http://localhost/api/image-proxy?url=${encodeURIComponent(target)}`);
}

function imageResponse(body: BodyInit | null, headers: Record<string, string> = {}) {
    return new Response(body, {
        status: 200,
        headers: { "content-type": "image/png", ...headers },
    });
}

describe("GET /api/image-proxy", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
        vi.mocked(enforceRateLimit).mockResolvedValue({ ok: true } as any);
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", `https://${OWN_HOST}`);
        vi.stubGlobal("fetch", fetchMock);
        fetchMock.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllEnvs();
        vi.unstubAllGlobals();
    });

    it("proxies images from this project's own Supabase host", async () => {
        fetchMock.mockResolvedValue(imageResponse(new Uint8Array([1, 2, 3])));

        const response = await GET(
            proxyRequest(`https://${OWN_HOST}/storage/v1/object/public/a.png`)
        );

        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toBe("image/png");
        expect(Buffer.from(await response.arrayBuffer())).toEqual(Buffer.from([1, 2, 3]));
    });

    it("refuses another tenant's Supabase project", async () => {
        const response = await GET(
            proxyRequest("https://attacker-project.supabase.co/storage/v1/object/public/a.png")
        );

        expect(response.status).toBe(400);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("refuses every Supabase host when the project URL is not configured", async () => {
        vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");

        const response = await GET(proxyRequest(`https://${OWN_HOST}/a.png`));

        expect(response.status).toBe(400);
    });

    it("keeps the other allowed hosts", async () => {
        fetchMock.mockResolvedValue(imageResponse(new Uint8Array([9])));

        const response = await GET(proxyRequest("https://images.unsplash.com/photo.png"));

        expect(response.status).toBe(200);
    });

    it("refuses a redirect to a host outside the allowlist", async () => {
        fetchMock.mockResolvedValue(
            new Response(null, {
                status: 302,
                headers: { location: "https://attacker-project.supabase.co/x.png" },
            })
        );

        const response = await GET(proxyRequest(`https://${OWN_HOST}/a.png`));

        expect(response.status).toBe(400);
    });

    it("rejects a declared body over the 25MB cap", async () => {
        fetchMock.mockResolvedValue(
            imageResponse(new Uint8Array([1]), { "content-length": String(26 * 1024 * 1024) })
        );

        const response = await GET(proxyRequest(`https://${OWN_HOST}/big.png`));

        expect(response.status).toBe(413);
    });

    it("aborts a body that trickles past the total deadline", async () => {
        vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

        const stalled = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(new Uint8Array([1, 2, 3]));
                // never closes: the upstream stops sending
            },
        });
        fetchMock.mockResolvedValue(imageResponse(stalled));

        const pending = GET(proxyRequest(`https://${OWN_HOST}/slow.png`));
        await vi.advanceTimersByTimeAsync(16_000);
        const response = await pending;

        expect(response.status).toBe(504);
    });
});
