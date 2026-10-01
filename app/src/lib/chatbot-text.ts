/**
 * Pure chat text helpers, safe to import from client components.
 *
 * These used to live in `chatbot.ts`, which also imports `support-chat.ts` and through it
 * the server-only Supabase client. `SupportChatbot.tsx` is a client component and needed
 * only a phone-number normaliser and a stage type, but the static import pulled the whole
 * server chain into the browser bundle. Nothing here may import a server module.
 */

export type ChatbotStage = "idle" | "asking_name" | "asking_phone" | "completed";

export function normalizeChatText(value: string) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

export function normalizeName(value: string) {
    return value.replace(/\s+/g, " ").trim();
}

export function normalizePhoneNumber(value: string) {
    return value.replace(/\D/g, "");
}

export function isValidPhoneNumber(value: string) {
    return /^\d{10}$/.test(normalizePhoneNumber(value));
}

export function isValidLeadName(value: string) {
    const normalized = normalizeName(value);
    return normalized.length >= 2;
}

export type SafeChatHref = {
    href: string;
    /** `external` links are absolute http(s) and should open in a new tab with noopener. */
    kind: "internal" | "external" | "contact";
};

/**
 * Validates a link target taken from model output or stored FAQ text before it becomes an
 * `<a href>`. Only same-site relative paths and http, https, mailto and tel are allowed;
 * `javascript:`, `data:`, protocol-relative `//host` and everything else is rejected.
 */
export function getSafeChatHref(rawHref: string): SafeChatHref | null {
    const href = (rawHref || "").trim();
    if (!href || href.length > 500 || /[\s\u0000-\u001f\u007f]/.test(href)) {
        return null;
    }

    if (href.startsWith("/")) {
        return href.startsWith("//") || href.startsWith("/\\") ? null : { href, kind: "internal" };
    }

    let parsed: URL;
    try {
        parsed = new URL(href);
    } catch {
        return null;
    }

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return { href: parsed.toString(), kind: "external" };
    }

    if (parsed.protocol === "mailto:" || parsed.protocol === "tel:") {
        return { href, kind: "contact" };
    }

    return null;
}

export type ChatContentSegment =
    | { type: "text"; text: string }
    | { type: "bold"; text: string }
    | { type: "link"; label: string; href: string; kind: SafeChatHref["kind"] };

const CHAT_CONTENT_TOKEN = /\[([^\]\n]{1,200})\]\(([^)\s]{1,500})\)|\*\*([^*\n]{1,200})\*\*/g;

/**
 * Splits a reply into text, **bold** and [label](href) segments. Links with an unsafe href
 * degrade to their plain label, so a poisoned FAQ or model reply cannot inject a script URL.
 */
export function parseChatMessageContent(content: string): ChatContentSegment[] {
    const segments: ChatContentSegment[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    CHAT_CONTENT_TOKEN.lastIndex = 0;
    while ((match = CHAT_CONTENT_TOKEN.exec(content)) !== null) {
        if (match.index > lastIndex) {
            segments.push({ type: "text", text: content.slice(lastIndex, match.index) });
        }

        if (match[3] !== undefined) {
            segments.push({ type: "bold", text: match[3] });
        } else {
            const safe = getSafeChatHref(match[2]);
            if (safe) {
                segments.push({ type: "link", label: match[1], href: safe.href, kind: safe.kind });
            } else {
                segments.push({ type: "text", text: match[1] });
            }
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < content.length) {
        segments.push({ type: "text", text: content.slice(lastIndex) });
    }

    return segments;
}
