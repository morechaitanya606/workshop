import { Button, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./components/Layout";

interface BookingConfirmationEmailProps {
    firstName: string;
    workshopTitle: string;
    date: string;
    time: string;
    location: string;
    guests: number;
}

export function BookingConfirmationEmail({
    firstName,
    workshopTitle,
    date,
    time,
    location,
    guests,
}: BookingConfirmationEmailProps) {
    const previewText = `Your booking for ${workshopTitle} is confirmed!`;
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const profileUrl = `${baseUrl}/profile`;

    return (
        <EmailLayout previewText={previewText}>
            <Text style={greeting}>Hi {firstName},</Text>
            <Text style={paragraph}>
                Thanks for booking with Only Workshops! You are confirmed for{" "}
                <strong>{workshopTitle}</strong>.
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
                <Text style={detailItem}>
                    <strong>Guests:</strong> {guests}
                </Text>
            </div>

            <Text style={paragraph}>
                We will send you a reminder closer to the event date. In the meantime, you can view
                or manage your bookings in your profile.
            </Text>

            <div style={buttonContainer}>
                <Button style={button} href={profileUrl}>
                    View Bookings
                </Button>
            </div>

            <Text style={paragraph}>
                If you have any questions, feel free to reply directly to this email. We can&apos;t
                wait to see you there!
            </Text>
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
