import type { Meta, StoryObj } from "@storybook/react";
import SearchBar from "@/components/SearchBar";

const meta = {
    title: "Marketplace/SearchBar",
    component: SearchBar,
    parameters: {
        layout: "padded",
    },
    args: {
        selectedCategoryId: "pottery",
    },
} satisfies Meta<typeof SearchBar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const TrendingCategory: Story = {
    args: {
        selectedCategoryId: "trending",
    },
};
