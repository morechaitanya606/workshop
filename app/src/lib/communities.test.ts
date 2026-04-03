import { describe, expect, it } from "vitest";
import {
    getMockCommunityBySlug,
    getCommunitySocialPreviewImage,
    mergeCommunities,
    normalizeCommunitySlug,
    mockCommunities,
} from "@/lib/communities";

describe("communities helpers", () => {
    it("normalizes slugs before looking up mock communities", () => {
        const community = getMockCommunityBySlug("BANGALORE-SLOW-POTTERS-CLUB");

        expect(community?.title).toBe("Bangalore Slow Potters Club");
    });

    it("decodes URL-encoded slugs consistently", () => {
        expect(normalizeCommunitySlug("pune-film-walk-collective")).toBe(
            "pune-film-walk-collective"
        );
        expect(normalizeCommunitySlug("mumbai-storytellers-circle")).toBe(
            "mumbai-storytellers-circle"
        );
    });

    it("falls back safely when a slug contains malformed escape sequences", () => {
        expect(normalizeCommunitySlug("Bangalore%2")).toBe("bangalore%2");
    });

    it("keeps primary communities first when merging duplicate slugs", () => {
        const primary = [
            {
                ...mockCommunities[0],
                title: "Priority Community",
            },
        ];

        const merged = mergeCommunities(primary, mockCommunities);

        expect(merged[0]?.title).toBe("Priority Community");
        expect(
            merged.filter((community) => community.slug === mockCommunities[0]?.slug)
        ).toHaveLength(1);
    });

    it("deduplicates merged communities by normalized slug", () => {
        const duplicate = {
            ...mockCommunities[0],
            slug: mockCommunities[0]!.slug.toUpperCase(),
            title: "Duplicate Casing",
        };

        const merged = mergeCommunities([duplicate], mockCommunities);

        expect(
            merged.filter(
                (community) =>
                    normalizeCommunitySlug(community.slug) ===
                    normalizeCommunitySlug(mockCommunities[0]!.slug)
            )
        ).toHaveLength(1);
        expect(merged[0]?.title).toBe("Duplicate Casing");
    });

    it("uses remote cover images for social previews", () => {
        expect(getCommunitySocialPreviewImage("https://cdn.example.com/community-cover.webp")).toBe(
            "https://cdn.example.com/community-cover.webp"
        );
    });

    it("falls back to the default social preview for local cover image paths", () => {
        expect(getCommunitySocialPreviewImage(mockCommunities[0]!.coverImage)).toBe(
            "/images/og-default.jpg"
        );
    });
});
