import { Button, Text } from "@react-email/components";
import * as React from "react";
import { getAppUrl } from "@/lib/env";
import { EmailLayout } from "./components/Layout";

interface FeedbackRequestEmailProps {
    firstName: string;
    workshopTitle: string;
    workshopId: string;
}

export function FeedbackRequestEmail({
    firstName,
    workshopTitle,
    workshopId,
}: FeedbackRequestEmailProps) {
    const previewText = `How was ${workshopTitle}? Share your feedback!`;
    const baseUrl = getAppUrl();
    const feedbackUrl = `${baseUrl}/workshop/${workshopId}`;

    return (
        <EmailLayout previewText={previewText}>
            <Text style={greeting}>Hi {firstName},</Text>
            <Text style={paragraph}>
                We hope you enjoyed <strong>{workshopTitle}</strong>!
            </Text>

            <Text style={paragraph}>
                Your host would love to hear about your experience. Leaving a review helps other
                learners find great workshops and gives valuable feedback to the creators.
            </Text>

            <div style={buttonContainer}>
                <Button style={button} href={feedbackUrl}>
                    Leave a Review
                </Button>
            </div>

            <Text style={paragraph}>Thanks for being part of the Only Workshops community!</Text>
        </EmailLayout>
    );
}

// Styles
const greeting = {
    fontSize: "20px",
    fontWeight: "600",
    color: "#0f172a", // slate-900
    margin: "0 0 16px",
};

const paragraph = {
    fontSize: "16px",
    lineHeight: "24px",
    color: "#334155", // slate-700
    margin: "0 0 16px",
};

const buttonContainer = {
    textAlign: "center" as const,
    margin: "32px 0",
};

const button = {
    backgroundColor: "#2563eb", // blue-600
    borderRadius: "6px",
    color: "#ffffff",
    fontSize: "16px",
    fontWeight: "600",
    textDecoration: "none",
    padding: "12px 24px",
    display: "inline-block",
};
