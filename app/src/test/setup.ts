import "@testing-library/jest-dom/vitest";
import React from "react";
import { vi } from "vitest";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}
if (
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
) {
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
}

vi.mock("next/image", () => ({
    default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean }) => {
        const { fill: _fill, ...rest } = props;
        return React.createElement("img", { ...rest, alt: props.alt || "" });
    },
}));

vi.mock("next/link", () => ({
    default: ({
        children,
        href,
        ...props
    }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) =>
        React.createElement("a", { ...props, href }, children),
}));

if (!("IntersectionObserver" in globalThis)) {
    class MockIntersectionObserver {
        observe() {}
        unobserve() {}
        disconnect() {}
        takeRecords() {
            return [];
        }
        root = null;
        rootMargin = "0px";
        thresholds = [];
    }

    (
        globalThis as typeof globalThis & {
            IntersectionObserver: typeof MockIntersectionObserver;
        }
    ).IntersectionObserver = MockIntersectionObserver;
}
