import type { Meta, StoryObj } from "@storybook/react";
import { Button } from "@/components/ui/button";

const meta = {
    title: "Primitives/Button",
    component: Button,
    parameters: {
        layout: "centered",
    },
    args: {
        children: "Action",
    },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
    args: {
        variant: "primary",
    },
};

export const Secondary: Story = {
    args: {
        variant: "secondary",
    },
};

export const Ghost: Story = {
    args: {
        variant: "ghost",
    },
};

export const Destructive: Story = {
    args: {
        variant: "destructive",
    },
};
