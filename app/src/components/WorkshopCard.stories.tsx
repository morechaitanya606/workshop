import type { Meta, StoryObj } from "@storybook/react";
import WorkshopCard from "@/components/WorkshopCard";
import { mockWorkshops } from "@/lib/data";

const meta = {
    title: "Marketplace/WorkshopCard",
    component: WorkshopCard,
    parameters: {
        layout: "padded",
    },
    args: {
        workshop: mockWorkshops[0],
    },
} satisfies Meta<typeof WorkshopCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Compact: Story = {
    args: {
        workshop: mockWorkshops[1],
        variant: "compact",
    },
};
