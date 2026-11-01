import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WorkshopTitleLink from "./WorkshopTitleLink";

afterEach(() => {
    cleanup();
});

describe("WorkshopTitleLink", () => {
    it("opens the public event page of an approved workshop", () => {
        render(
            <WorkshopTitleLink
                workshop={{
                    id: "pottery-1760000000000",
                    title: "Pottery Basics",
                    approvalStatus: "approved",
                }}
            />
        );
        expect(screen.getByRole("link", { name: "Pottery Basics" })).toHaveAttribute(
            "href",
            "/workshop/pottery-1760000000000"
        );
    });

    it("links a workshop whose approval status is not recorded (older rows are live)", () => {
        render(<WorkshopTitleLink workshop={{ id: "old-1", title: "Old Workshop" }} />);
        expect(screen.getByRole("link", { name: "Old Workshop" })).toHaveAttribute(
            "href",
            "/workshop/old-1"
        );
    });

    it.each(["pending", "rejected"] as const)(
        "keeps a %s workshop as plain text, because its public page does not exist",
        (approvalStatus) => {
            render(
                <WorkshopTitleLink
                    workshop={{ id: "new-1", title: "Not Live Yet", approvalStatus }}
                />
            );
            expect(screen.getByText("Not Live Yet")).toBeInTheDocument();
            expect(screen.queryByRole("link")).not.toBeInTheDocument();
        }
    );
});
