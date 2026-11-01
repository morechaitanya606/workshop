import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/lib/sentry-client";
import RootError from "./error";

vi.mock("@/lib/sentry-client", () => ({ reportError: vi.fn() }));

describe("RootError", () => {
    afterEach(() => {
        cleanup();
    });

    it("reports the error through the lazy Sentry helper and offers a way back", () => {
        const error = new Error("render failed");
        render(<RootError error={error} reset={vi.fn()} />);

        expect(reportError).toHaveBeenCalledWith(error, { route: "root", layer: "web" });
        expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
        expect(screen.getByRole("link", { name: "Back to home" })).toHaveAttribute("href", "/");
    });
});
