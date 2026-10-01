/**
 * Single source of truth for which `platform_settings` keys exist, which of them may be
 * shown to the public, and what a valid value looks like.
 *
 * `platform_settings` is a key/value table (setting_key text, setting_value jsonb), so no
 * migration is needed to add a key -- but without an allowlist the PATCH route accepted any
 * key with any JSON, and every reader did `select *` and forwarded every row to the browser.
 * Everything here is pure (no server-only imports) so the route, the cached reader, the admin
 * form and the sold-out modal can all share the same rules.
 */

export const SERVICE_FEE_MAX = 100_000;
export const WHATSAPP_COMMUNITY_URL_MAX_LENGTH = 500;
export const WHATSAPP_COMMUNITY_MESSAGE_MAX_LENGTH = 240;

/** Hosts an admin may point the community button at. Exact match, https only. */
export const WHATSAPP_COMMUNITY_HOSTS = [
    "chat.whatsapp.com",
    "wa.me",
    "whatsapp.com",
    // WhatsApp Channels live at https://www.whatsapp.com/channel/<id>.
    "www.whatsapp.com",
] as const;

/**
 * Keys an admin may write. Anything else is rejected with 400, so a typo or a probing
 * request cannot create arbitrary rows.
 */
export const WRITABLE_SETTING_KEYS = [
    "service_fee",
    "hero_image_url",
    "special_page",
    "cafe_partners",
    "early_bird_offer",
    "whatsapp_community_url",
    "whatsapp_community_message",
] as const;

/**
 * Keys that are safe to send to every visitor. Today this equals the writable set because
 * every known key is presentation or pricing data the site already renders publicly. It is
 * kept as its own list on purpose: the day someone adds a private key (a webhook secret, an
 * internal note) to WRITABLE_SETTING_KEYS it stays server-side until it is added here too.
 */
export const PUBLIC_SETTING_KEYS = [
    "service_fee",
    "hero_image_url",
    "special_page",
    "cafe_partners",
    "early_bird_offer",
    "whatsapp_community_url",
    "whatsapp_community_message",
] as const;

export type WritableSettingKey = (typeof WRITABLE_SETTING_KEYS)[number];
export type PublicSettingKey = (typeof PUBLIC_SETTING_KEYS)[number];

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue | undefined };

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

function fail(error: string): { ok: false; error: string } {
    return { ok: false, error };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/* -------------------------------------------------------------------------- */
/* WhatsApp community link                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Validates an admin-entered WhatsApp community link.
 *
 * - empty / whitespace clears the setting (returns ""),
 * - only https on chat.whatsapp.com, wa.me, whatsapp.com (and www.whatsapp.com),
 * - no embedded credentials, no custom port, and a real path (a bare host is a dead link).
 */
export function validateWhatsAppCommunityUrl(input: unknown): ValidationResult<string> {
    if (input === null || input === undefined) return { ok: true, value: "" };
    if (typeof input !== "string") return fail("WhatsApp community link must be text.");

    const trimmed = input.trim();
    if (!trimmed) return { ok: true, value: "" };

    if (trimmed.length > WHATSAPP_COMMUNITY_URL_MAX_LENGTH) {
        return fail(
            `WhatsApp community link must be at most ${WHATSAPP_COMMUNITY_URL_MAX_LENGTH} characters.`
        );
    }
    // new URL() silently strips tabs/newlines, so check for them ourselves.
    if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) {
        return fail("WhatsApp community link must not contain spaces.");
    }

    let url: URL;
    try {
        url = new URL(trimmed);
    } catch {
        return fail("Enter a full link, for example https://chat.whatsapp.com/AbCdEf123.");
    }

    if (url.protocol !== "https:") {
        return fail("The link must start with https://.");
    }
    if (url.username || url.password) {
        return fail("The link must not contain a username or password.");
    }
    if (url.port) {
        return fail("The link must not include a port number.");
    }
    if (!(WHATSAPP_COMMUNITY_HOSTS as readonly string[]).includes(url.hostname.toLowerCase())) {
        return fail("Only chat.whatsapp.com, wa.me or whatsapp.com links are allowed.");
    }
    if (url.pathname === "/" || url.pathname === "") {
        return fail("This link is incomplete. Copy the full invite link from WhatsApp.");
    }

    return { ok: true, value: trimmed };
}

/**
 * Returns a link that is safe to put in an href, or null. Used on the public side so a bad
 * value that somehow reached the table (manual SQL edit, older deploy) can never render a
 * broken or hostile button.
 */
export function sanitizeWhatsAppCommunityUrl(input: unknown): string | null {
    const result = validateWhatsAppCommunityUrl(input);
    return result.ok && result.value ? result.value : null;
}

export function validateWhatsAppCommunityMessage(input: unknown): ValidationResult<string> {
    if (input === null || input === undefined) return { ok: true, value: "" };
    if (typeof input !== "string") return fail("Community message must be text.");
    const trimmed = input.trim();
    if (trimmed.length > WHATSAPP_COMMUNITY_MESSAGE_MAX_LENGTH) {
        return fail(
            `Community message must be at most ${WHATSAPP_COMMUNITY_MESSAGE_MAX_LENGTH} characters.`
        );
    }
    return { ok: true, value: trimmed };
}

/* -------------------------------------------------------------------------- */
/* Per-key validators                                                          */
/* -------------------------------------------------------------------------- */

function boundedString(
    value: unknown,
    label: string,
    max: number,
    { allowEmpty = true }: { allowEmpty?: boolean } = {}
): ValidationResult<string> {
    if (typeof value !== "string") return fail(`${label} must be text.`);
    const trimmed = value.trim();
    if (!allowEmpty && !trimmed) return fail(`${label} is required.`);
    if (trimmed.length > max) return fail(`${label} must be at most ${max} characters.`);
    return { ok: true, value: trimmed };
}

/** Same-site path ("/images/x.webp") or an https URL. Rejects javascript:, data:, "//host". */
function validateImageReference(value: unknown, label: string): ValidationResult<string> {
    const text = boundedString(value, label, 2048);
    if (!text.ok) return text;
    if (!text.value) return text;
    if (/[\s\u0000-\u001f\u007f]/.test(text.value)) {
        return fail(`${label} must not contain spaces.`);
    }
    if (text.value.startsWith("/") && !text.value.startsWith("//")) return text;
    try {
        if (new URL(text.value).protocol === "https:") return text;
    } catch {
        // fall through
    }
    return fail(`${label} must be a path starting with / or an https:// link.`);
}

function rejectUnknownKeys(
    source: Record<string, unknown>,
    allowed: readonly string[],
    label: string
): { ok: false; error: string } | null {
    const unknown = Object.keys(source).find((key) => !allowed.includes(key));
    return unknown ? fail(`${label} contains an unknown field.`) : null;
}

function validateServiceFee(value: unknown): ValidationResult<number> {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return fail("Service fee must be a number.");
    }
    if (value < 0 || value > SERVICE_FEE_MAX) {
        return fail(`Service fee must be between 0 and ${SERVICE_FEE_MAX}.`);
    }
    return { ok: true, value };
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function validateSpecialPage(value: unknown): ValidationResult<Record<string, JsonValue>> {
    if (!isPlainObject(value)) return fail("Special page must be an object.");
    const unknownField = rejectUnknownKeys(
        value,
        ["enabled", "path", "title", "description", "badge", "cta_label", "visible_until"],
        "Special page"
    );
    if (unknownField) return unknownField;

    const next: Record<string, JsonValue> = {};

    if (value.enabled !== undefined) {
        if (typeof value.enabled !== "boolean")
            return fail("Special page enabled must be true or false.");
        next.enabled = value.enabled;
    }
    if (value.path !== undefined) {
        const path = boundedString(value.path, "Special page path", 200);
        if (!path.ok) return path;
        if (path.value && (!path.value.startsWith("/") || path.value.startsWith("//"))) {
            return fail("Special page path must start with a single /.");
        }
        next.path = path.value;
    }
    for (const [field, label, max] of [
        ["title", "Special page title", 200],
        ["description", "Special page description", 2000],
        ["badge", "Special page badge", 100],
        ["cta_label", "Special page button label", 100],
    ] as const) {
        if (value[field] !== undefined) {
            const text = boundedString(value[field], label, max);
            if (!text.ok) return text;
            next[field] = text.value;
        }
    }
    if (value.visible_until !== undefined) {
        if (typeof value.visible_until !== "string" || !DATE_PATTERN.test(value.visible_until)) {
            return fail("Special page visible-until date must look like 2026-05-09.");
        }
        next.visible_until = value.visible_until;
    }

    return { ok: true, value: next };
}

const MAX_CAFE_PARTNERS = 100;

function validateCafePartners(value: unknown): ValidationResult<JsonValue[]> {
    if (!Array.isArray(value)) return fail("Cafe partners must be a list.");
    if (value.length > MAX_CAFE_PARTNERS) {
        return fail(`At most ${MAX_CAFE_PARTNERS} cafe partners are allowed.`);
    }

    const partners: JsonValue[] = [];
    for (const item of value) {
        if (!isPlainObject(item)) return fail("Each cafe partner must be an object.");
        const unknownField = rejectUnknownKeys(item, ["id", "name", "logo_url"], "Cafe partner");
        if (unknownField) return unknownField;

        const id = boundedString(item.id, "Cafe partner id", 120, { allowEmpty: false });
        if (!id.ok) return id;
        const name = boundedString(item.name, "Cafe partner name", 200, { allowEmpty: false });
        if (!name.ok) return name;
        const logo = validateImageReference(item.logo_url, "Cafe partner logo");
        if (!logo.ok) return logo;
        if (!logo.value) return fail("Cafe partner logo is required.");

        partners.push({ id: id.value, name: name.value, logo_url: logo.value });
    }

    return { ok: true, value: partners };
}

function validateEarlyBirdOffer(value: unknown): ValidationResult<Record<string, JsonValue>> {
    if (!isPlainObject(value)) return fail("Early bird offer must be an object.");
    const unknownField = rejectUnknownKeys(
        value,
        ["enabled", "discount_type", "discount_value", "days_before"],
        "Early bird offer"
    );
    if (unknownField) return unknownField;

    if (typeof value.enabled !== "boolean")
        return fail("Early bird enabled must be true or false.");
    if (value.discount_type !== "percentage" && value.discount_type !== "fixed") {
        return fail("Early bird discount type must be percentage or fixed.");
    }
    if (typeof value.discount_value !== "number" || !Number.isFinite(value.discount_value)) {
        return fail("Early bird discount value must be a number.");
    }
    const maxDiscount = value.discount_type === "percentage" ? 100 : SERVICE_FEE_MAX;
    if (value.discount_value < 0 || value.discount_value > maxDiscount) {
        return fail(`Early bird discount value must be between 0 and ${maxDiscount}.`);
    }
    if (
        typeof value.days_before !== "number" ||
        !Number.isInteger(value.days_before) ||
        value.days_before < 0 ||
        value.days_before > 3650
    ) {
        return fail("Early bird days-before must be a whole number between 0 and 3650.");
    }

    return {
        ok: true,
        value: {
            enabled: value.enabled,
            discount_type: value.discount_type,
            discount_value: value.discount_value,
            days_before: value.days_before,
        },
    };
}

function validateHeroImageUrl(value: unknown): ValidationResult<string> {
    return validateImageReference(value, "Hero image");
}

const VALIDATORS: Record<WritableSettingKey, (value: unknown) => ValidationResult<JsonValue>> = {
    service_fee: validateServiceFee,
    hero_image_url: validateHeroImageUrl,
    special_page: validateSpecialPage,
    cafe_partners: validateCafePartners,
    early_bird_offer: validateEarlyBirdOffer,
    whatsapp_community_url: validateWhatsAppCommunityUrl,
    whatsapp_community_message: validateWhatsAppCommunityMessage,
};

export function isWritableSettingKey(key: string): key is WritableSettingKey {
    return (WRITABLE_SETTING_KEYS as readonly string[]).includes(key);
}

export type SettingsPatchResult =
    | { ok: true; values: Record<string, JsonValue> }
    | { ok: false; error: string; key?: string };

/**
 * Validates a `{ settings }` PATCH payload. Unknown keys, wrong types and out-of-range values
 * all fail the whole request (nothing is partially applied). Returned values are the
 * normalised ones (trimmed strings, rebuilt objects) and are what should be stored.
 */
export function validateSettingsPatch(settings: unknown): SettingsPatchResult {
    if (!isPlainObject(settings)) {
        return { ok: false, error: "Invalid payload. Expected { settings: object }" };
    }

    const entries = Object.entries(settings);
    if (entries.length === 0) {
        return { ok: false, error: "No settings provided." };
    }

    const values: Record<string, JsonValue> = {};
    for (const [key, raw] of entries) {
        if (!isWritableSettingKey(key)) {
            return { ok: false, error: "Unknown setting.", key };
        }
        const result = VALIDATORS[key](raw);
        if (!result.ok) {
            return { ok: false, error: result.error, key };
        }
        values[key] = result.value;
    }

    return { ok: true, values };
}

/**
 * Keeps only public keys from a settings record. Use this at every boundary where settings
 * are handed to a browser. The community link is additionally re-validated so a bad stored
 * value is dropped instead of rendered.
 */
export function pickPublicSettings<T extends Record<string, unknown>>(
    record: T | null | undefined
): Partial<Record<PublicSettingKey, unknown>> {
    const picked: Partial<Record<PublicSettingKey, unknown>> = {};
    if (!record) return picked;

    for (const key of PUBLIC_SETTING_KEYS) {
        if (record[key] !== undefined) {
            picked[key] = record[key];
        }
    }

    if ("whatsapp_community_url" in picked) {
        picked.whatsapp_community_url =
            sanitizeWhatsAppCommunityUrl(picked.whatsapp_community_url) ?? "";
    }

    return picked;
}
