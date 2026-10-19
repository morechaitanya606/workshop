import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("./supabase-server", () => ({
    createSupabaseServiceClient: vi.fn(),
    isSupabaseServiceConfigured: false,
}));
vi.mock("./image-conversion", () => ({
    convertImageToWebp: vi.fn(async () => ({
        buffer: Buffer.from("webp"),
        extension: "webp",
        contentType: "image/webp",
    })),
}));

import type { SupabaseServerClient } from "./supabase-server";
import { mirrorImageFields, planImageMirror } from "./image-mirror";

const STORAGE = "https://abc.supabase.co/storage/v1/object/public/uploads/";
const DRIVE_ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";

function fakeStorage() {
    const uploads: string[] = [];
    const client = {
        storage: {
            from: () => ({
                getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE}${path}` } }),
                upload: vi.fn(async (path: string) => {
                    uploads.push(path);
                    return { error: null };
                }),
            }),
        },
    } as unknown as SupabaseServerClient;
    return { client, uploads };
}

function stubFetch({ copyExists = false, sourceOk = true } = {}) {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === "HEAD") return new Response(null, { status: copyExists ? 200 : 404 });
        return sourceOk
            ? new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })
            : new Response("<html>", { status: 403, headers: { "content-type": "text/html" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("planImageMirror", () => {
    it("fetches Drive photos at 2400px under the same name as the mirror script", () => {
        const plan = {
            sourceUrl: `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w2400`,
            objectPath: `mirrored/drive-${DRIVE_ID}.webp`,
        };
        expect(
            planImageMirror(`https://drive.google.com/file/d/${DRIVE_ID}/view?usp=sharing`)
        ).toEqual(plan);
        expect(
            planImageMirror(`https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1200`)
        ).toEqual(plan);
    });

    it("asks Unsplash for the large rendition", () => {
        const plan = planImageMirror("https://images.unsplash.com/photo-1?w=400&h=300&q=80");
        expect(plan?.sourceUrl).toBe("https://images.unsplash.com/photo-1?w=2400&q=80");
        expect(plan?.objectPath).toMatch(/^mirrored\/url-[0-9a-f]{32}\.webp$/);
    });

    it("leaves our own storage, site paths and other links alone", () => {
        expect(planImageMirror(`${STORAGE}mirrored/drive-x.webp`)).toBeNull();
        expect(planImageMirror("/images/hero.jpg")).toBeNull();
        expect(planImageMirror("http://lh3.googleusercontent.com/a")).toBeNull();
        expect(planImageMirror("https://example.com/photo.jpg")).toBeNull();
        expect(planImageMirror("https://drive.google.com/thumbnail?id=../x")).toBeNull();
        expect(planImageMirror("")).toBeNull();
    });
});

describe("mirrorImageFields", () => {
    it("swaps pasted links for storage copies, copying each photo once", async () => {
        const fetchMock = stubFetch();
        const { client, uploads } = fakeStorage();
        const drive = `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1200`;
        const ours = `${STORAGE}abc/photo.webp`;
        const data = { coverImage: drive, galleryImages: [drive, ours], title: drive };

        await mirrorImageFields(data, ["coverImage", "galleryImages"], client);

        const copy = `${STORAGE}mirrored/drive-${DRIVE_ID}.webp`;
        expect(data).toEqual({ coverImage: copy, galleryImages: [copy, ours], title: drive });
        expect(uploads).toEqual([`mirrored/drive-${DRIVE_ID}.webp`]);
        expect(fetchMock).toHaveBeenCalledWith(
            `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w2400`,
            expect.anything()
        );
    });

    it("reuses a copy that is already in storage", async () => {
        stubFetch({ copyExists: true });
        const { client, uploads } = fakeStorage();
        const data = { imageUrl: `https://drive.google.com/open?id=${DRIVE_ID}` };

        await mirrorImageFields(data, ["imageUrl"], client);

        expect(data.imageUrl).toBe(`${STORAGE}mirrored/drive-${DRIVE_ID}.webp`);
        expect(uploads).toEqual([]);
    });

    it("keeps the link when the photo cannot be fetched, so the save still works", async () => {
        stubFetch({ sourceOk: false });
        const { client, uploads } = fakeStorage();
        const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
        const link = `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1200`;
        const data = { photos: [link] };

        await mirrorImageFields(data, ["photos"], client);

        expect(data.photos).toEqual([link]);
        expect(uploads).toEqual([]);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it("does nothing without a storage client", async () => {
        const fetchMock = stubFetch();
        const link = `https://drive.google.com/thumbnail?id=${DRIVE_ID}&sz=w1200`;
        const data = { coverImage: link };

        await mirrorImageFields(data, ["coverImage"]);

        expect(data.coverImage).toBe(link);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
