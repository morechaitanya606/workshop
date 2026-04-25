import { Button, Text } from "@react-email/components";
import * as React from "react";
import { getAppUrl } from "@/lib/env";
import { EmailLayout } from "./components/Layout";

interface WorkshopReminderEmailProps {
    firstName: string;
    workshopTitle: string;
    date: string;
    time: string;
    location: string;
}

export function WorkshopReminderEmail({
    firstName,
    workshopTitle,
    date,
    time,
    location,
}: WorkshopReminderEmailProps) {
    const previewText = `Reminder: ${workshopTitle} is coming up!`;
    const baseUrl = getAppUrl();
    const profileUrl = `${baseUrl}/profile`;

    return (
        <EmailLayout previewText={previewText}>
            <Text style={greeting}>Hi {firstName},</Text>
            <Text style={paragraph}>
                Get ready! Your upcoming workshop <strong>{workshopTitle}</strong> is starting soon.
            </Text>

            <div style={detailsBox}>
                <Text style={detailItem}>
                    <strong>Date:</strong> {date}
                </Text>
                <Text style={detailItem}>
                    <strong>Time:</strong> {time}
                </Text>
                <Text style={detailItem}>
                    <strong>Location:</strong> {location}
                </Text>
            </div>

            <Text style={paragraph}>
                Please arrive a few minutes early. If you need to review your booking details or get
                directions, you can access your profile using the button below.
            </Text>

            <div style={buttonContainer}>
                <Button style={button} href={profileUrl}>
                    View Booking Info
                </Button>
            </div>

            <Text style={paragraph}>See you soon!</Text>
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

const detailsBox = {
    backgroundColor: "#f8fafc", // slate-50
    border: "1px solid #e2e8f0", // slate-200
    borderRadius: "8px",
    padding: "24px",
    margin: "24px 0",
};

const detailItem = {
    fontSize: "15px",
    color: "#0f172a", // slate-900
    margin: "0 0 8px",
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
