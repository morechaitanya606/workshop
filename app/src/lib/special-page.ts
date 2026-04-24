export type SpecialPageSettings = {
    enabled?: boolean;
    path?: string;
    title?: string;
    description?: string;
    badge?: string;
    cta_label?: string;
    visible_until?: string;
};

export type ResolvedSpecialPageSettings = {
    enabled: boolean;
    path: string;
    title: string;
    description: string;
    badge: string;
    ctaLabel: string;
    visibleUntil: string;
};

export const DEFAULT_SPECIAL_PAGE_SETTINGS: ResolvedSpecialPageSettings = {
    enabled: true,
    path: "/workshop/summer-family-retreat",
    title: "Summer Family Retreat",
    description:
        "A special outing with your child to experience parenthood while tasting artisanal cheese and watching your child learn to make drone models and cakesicles. Parent and child are welcome.",
    badge: "Special Event",
    ctaLabel: "Discover More",
    visibleUntil: "2026-05-09",
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSpecialPagePath(path: string | null | undefined) {
    const trimmedPath = path?.trim();
    if (!trimmedPath) {
        return DEFAULT_SPECIAL_PAGE_SETTINGS.path;
    }

    if (trimmedPath.startsWith("/")) {
        return trimmedPath;
    }

    return `/${trimmedPath}`;
}

export function normalizeSpecialPageDate(value: string | null | undefined) {
    const trimmedValue = value?.trim();
    if (!trimmedValue || !DATE_PATTERN.test(trimmedValue)) {
        return DEFAULT_SPECIAL_PAGE_SETTINGS.visibleUntil;
    }

    return trimmedValue;
}

export function resolveSpecialPageSettings(
    settings: SpecialPageSettings | null | undefined
): ResolvedSpecialPageSettings {
    return {
        enabled:
            typeof settings?.enabled === "boolean"
                ? settings.enabled
                : DEFAULT_SPECIAL_PAGE_SETTINGS.enabled,
        path: normalizeSpecialPagePath(settings?.path),
        title: settings?.title?.trim() || DEFAULT_SPECIAL_PAGE_SETTINGS.title,
        description: settings?.description?.trim() || DEFAULT_SPECIAL_PAGE_SETTINGS.description,
        badge: settings?.badge?.trim() || DEFAULT_SPECIAL_PAGE_SETTINGS.badge,
        ctaLabel: settings?.cta_label?.trim() || DEFAULT_SPECIAL_PAGE_SETTINGS.ctaLabel,
        visibleUntil: normalizeSpecialPageDate(settings?.visible_until),
    };
}

export function getLocalDateKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

export function isSpecialPageActive(
    settings: SpecialPageSettings | null | undefined,
    date = new Date()
) {
    const resolvedSettings = resolveSpecialPageSettings(settings);
    return resolvedSettings.enabled && getLocalDateKey(date) <= resolvedSettings.visibleUntil;
}

export function isSpecialPagePath(
    pathname: string,
    settings: SpecialPageSettings | null | undefined
) {
    const resolvedPath = resolveSpecialPageSettings(settings).path;
    return pathname === resolvedPath || pathname.startsWith(`${resolvedPath}/`);
}

export function formatSpecialPageDate(value: string | null | undefined, locale = "en-IN") {
    const normalizedValue = normalizeSpecialPageDate(value);
    const date = new Date(`${normalizedValue}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
        return normalizedValue;
    }

    return new Intl.DateTimeFormat(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
    }).format(date);
}
