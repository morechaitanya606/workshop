import { Heading, Link, Section, Text } from "@react-email/components";
import * as React from "react";
import { EmailLayout } from "./components/Layout";

interface CareerApplicationEmailProps {
    fullName: string;
    email: string;
    phone: string;
    location: string;
    role: string;
    portfolioUrl?: string;
    coverLetter: string;
    resumeFileName: string;
}

export function CareerApplicationEmail({
    fullName,
    email,
    phone,
    location,
    role,
    portfolioUrl,
    coverLetter,
    resumeFileName,
}: CareerApplicationEmailProps) {
    const previewText = `New careers application from ${fullName}`;

    return (
        <EmailLayout previewText={previewText}>
            <Heading as="h2" style={heading}>
                New careers application
            </Heading>
            <Text style={paragraph}>
                A new careers application has been submitted through the Only Workshops careers
                page.
            </Text>

            <Section style={detailsBox}>
                <Text style={detailItem}>
                    <strong>Name:</strong> {fullName}
                </Text>
                <Text style={detailItem}>
                    <strong>Email:</strong> {email}
                </Text>
                <Text style={detailItem}>
                    <strong>Phone:</strong> {phone}
                </Text>
                <Text style={detailItem}>
                    <strong>Location:</strong> {location}
                </Text>
                <Text style={detailItem}>
                    <strong>Role:</strong> {role}
                </Text>
                <Text style={detailItem}>
                    <strong>Resume:</strong> {resumeFileName}
                </Text>
                {portfolioUrl ? (
                    <Text style={detailItem}>
                        <strong>LinkedIn / Portfolio:</strong>{" "}
                        <Link href={portfolioUrl} style={link}>
                            {portfolioUrl}
                        </Link>
                    </Text>
                ) : null}
            </Section>

            <Heading as="h3" style={subheading}>
                Candidate note
            </Heading>
            <Text style={coverLetterText}>{coverLetter}</Text>
        </EmailLayout>
    );
}

const heading = {
    fontSize: "24px",
    lineHeight: "32px",
    color: "#0f172a",
    margin: "0 0 16px",
};

const subheading = {
    fontSize: "18px",
    lineHeight: "28px",
    color: "#0f172a",
    margin: "24px 0 12px",
};

const paragraph = {
    fontSize: "16px",
    lineHeight: "24px",
    color: "#334155",
    margin: "0 0 16px",
};

const detailsBox = {
    backgroundColor: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: "10px",
    padding: "20px",
};

const detailItem = {
    fontSize: "15px",
    lineHeight: "22px",
    color: "#0f172a",
    margin: "0 0 10px",
};

const coverLetterText = {
    fontSize: "15px",
    lineHeight: "24px",
    color: "#334155",
    whiteSpace: "pre-line" as const,
    margin: "0",
};

const link = {
    color: "#c76b4f",
    textDecoration: "underline",
};
