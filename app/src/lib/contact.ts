export const CONTACT_PAGE_HREF = "/contact";

export const CONTACT_PHONE_NUMBERS = [
    {
        label: "+91 70284 78109",
        value: "+917028478109",
        description: "Workshop queries and general support",
    },
    {
        label: "+91 99216 04163",
        value: "+919921604163",
        description: "Alternate support line",
    },
] as const;

export const CONTACT_EMAILS = [
    {
        // The only mailbox (Hostinger). The old hello@onlyworkshop.com -- no "s" -- is a
        // different domain on someone else's mail server.
        label: "reachout@onlyworkshops.com",
        value: "reachout@onlyworkshops.com",
        description: "General support, partnerships, and host onboarding",
    },
] as const;
