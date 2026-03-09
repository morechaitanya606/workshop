import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WorkshopCard from "@/components/WorkshopCard";
import { mockWorkshops } from "@/lib/data";

describe("WorkshopCard", () => {
    it("renders workshop summary details", () => {
        const workshop = mockWorkshops[0];
        render(<WorkshopCard workshop={workshop} />);

        expect(screen.getByText(workshop.title)).toBeInTheDocument();
        expect(screen.getByText(`${workshop.location}, ${workshop.city}`)).toBeInTheDocument();
        expect(screen.getByText(/₹/)).toBeInTheDocument();
        expect(
            screen.getByText(
                `${workshop.seatsRemaining} seat${workshop.seatsRemaining === 1 ? "" : "s"} available`
            )
        ).toBeInTheDocument();
    });

    it("links to the workshop detail page", () => {
        const workshop = mockWorkshops[1];
        render(<WorkshopCard workshop={workshop} />);

        const link = screen.getByRole("link");
        expect(link).toHaveAttribute("href", `/workshop/${workshop.id}`);
    });

    it("shows sold out when seats are not available", () => {
        const soldOutWorkshop = {
            ...mockWorkshops[0],
            id: "sold-out-card",
            seatsRemaining: 0,
        };
        render(<WorkshopCard workshop={soldOutWorkshop} />);

        expect(screen.getByText("Sold out")).toBeInTheDocument();
    });
});
