import {
    Body,
    Container,
    Head,
    Heading,
    Hr,
    Html,
    Img,
    Link,
    Preview,
    Section,
    Text,
} from "@react-email/components";
import * as React from "react";

interface LayoutProps {
    previewText: string;
    children: React.ReactNode;
}

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function EmailLayout({ previewText, children }: LayoutProps) {
    return (
        <Html>
            <Head />
            <Preview>{previewText}</Preview>
            <Body style={main}>
                <Container style={container}>
                    <Section style={header}>
                        <Link href={baseUrl}>
                            {/* Assuming a basic text logo for now, or you can use an actual image */}
                            <Heading style={logoText}>OnlyWorkshop</Heading>
                        </Link>
                    </Section>

                    <Section style={content}>{children}</Section>

                    <Hr style={hr} />
                    <Section style={footer}>
                        <Text style={footerText}>
                            OnlyWorkshop — Discover & Book Creative Workshops
                        </Text>
                        <Text style={footerLinks}>
                            <Link href={`${baseUrl}/explore`} style={link}>
                                Explore Workshops
                            </Link>{" "}
                            •{" "}
                            <Link href={`${baseUrl}/profile`} style={link}>
                                Manage Bookings
                            </Link>
                        </Text>
                    </Section>
                </Container>
            </Body>
        </Html>
    );
}

const main = {
    backgroundColor: "#f6f9fc",
    fontFamily:
        '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
    backgroundColor: "#ffffff",
    margin: "40px auto",
    padding: "20px 0 48px",
    marginBottom: "64px",
    borderRadius: "12px",
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)",
    maxWidth: "600px",
};

const header = {
    padding: "0 48px",
    textAlign: "center" as const,
};

const logoText = {
    fontSize: "24px",
    fontWeight: "bold",
    color: "#0f172a", // slate-900
    margin: "0",
    padding: "16px 0",
};

const content = {
    padding: "0 48px",
};

const hr = {
    borderColor: "#e2e8f0", // slate-200
    margin: "32px 0 24px",
};

const footer = {
    padding: "0 48px",
    textAlign: "center" as const,
};

const footerText = {
    color: "#64748b", // slate-500
    fontSize: "14px",
    margin: "0 0 12px",
};

const footerLinks = {
    margin: "0",
};

const link = {
    color: "#6366f1", // indigo-500
    textDecoration: "underline",
};
