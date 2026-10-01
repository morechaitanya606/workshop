import { describe, expect, it } from "vitest";
import { getSafeVideoEmbed } from "./video-embed";

describe("getSafeVideoEmbed", () => {
    it("maps YouTube URLs to the no-cookie embed", () => {
        const expected = {
            kind: "embed",
            provider: "youtube",
            src: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
        };

        expect(getSafeVideoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toEqual(expected);
        expect(getSafeVideoEmbed("https://youtu.be/dQw4w9WgXcQ")).toEqual(expected);
        expect(getSafeVideoEmbed("https://www.youtube.com/embed/dQw4w9WgXcQ")).toEqual(expected);
        expect(getSafeVideoEmbed("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")).toEqual(
            expected
        );
    });

    it("maps Vimeo and Google Drive previews", () => {
        expect(getSafeVideoEmbed("https://vimeo.com/123456789")).toEqual({
            kind: "embed",
            provider: "vimeo",
            src: "https://player.vimeo.com/video/123456789",
        });
        expect(getSafeVideoEmbed("https://player.vimeo.com/video/123456789")).toMatchObject({
            kind: "embed",
        });
        expect(
            getSafeVideoEmbed("https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview")
        ).toEqual({
            kind: "embed",
            provider: "drive",
            src: "https://drive.google.com/file/d/1AbCdEfGhIjKlMn/preview",
        });
    });

    it("never frames an arbitrary host, even one that looks like a provider", () => {
        expect(getSafeVideoEmbed("https://evil.example/embed/abc")).toEqual({
            kind: "link",
            href: "https://evil.example/embed/abc",
        });
        expect(getSafeVideoEmbed("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toEqual({
            kind: "link",
            href: "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ",
        });
    });

    it("plays direct files and rejects unsafe schemes", () => {
        expect(getSafeVideoEmbed("https://cdn.example/clip.mp4")).toEqual({
            kind: "file",
            src: "https://cdn.example/clip.mp4",
        });
        expect(getSafeVideoEmbed("/uploads/clip.webm")).toEqual({
            kind: "file",
            src: "/uploads/clip.webm",
        });
        expect(getSafeVideoEmbed("javascript:alert(1)")).toBeNull();
        expect(getSafeVideoEmbed("data:text/html,<script>1</script>")).toBeNull();
        expect(getSafeVideoEmbed("http://insecure.example/clip.mp4")).toBeNull();
        expect(getSafeVideoEmbed("//protocol-relative.example/x")).toBeNull();
        expect(getSafeVideoEmbed("")).toBeNull();
        expect(getSafeVideoEmbed(undefined)).toBeNull();
    });
});
