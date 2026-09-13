"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

import { type PlatformSettings } from "@/lib/api-client";

type PlatformSettingsContextValue = {
    settings: PlatformSettings;
    loading: boolean;
    mergeSettings: (nextSettings: Partial<PlatformSettings>) => void;
};

const PlatformSettingsContext = createContext<PlatformSettingsContextValue | null>(null);

/**
 * Settings arrive from the server component that renders this provider, so there is no
 * client fetch on mount. That removed one uncacheable API call and one `select *` from
 * every single page view, and it takes the value off the critical render path (the page
 * transition in `app/template.tsx` reads `settings.special_page`).
 */
export function PlatformSettingsProvider({
    children,
    initialSettings,
}: {
    children: ReactNode;
    initialSettings?: PlatformSettings;
}) {
    const [settings, setSettings] = useState<PlatformSettings>(initialSettings ?? {});

    return (
        <PlatformSettingsContext.Provider
            value={{
                settings,
                loading: false,
                mergeSettings: (nextSettings) => {
                    setSettings((currentSettings) => ({
                        ...currentSettings,
                        ...nextSettings,
                    }));
                },
            }}
        >
            {children}
        </PlatformSettingsContext.Provider>
    );
}

export function usePlatformSettings() {
    const context = useContext(PlatformSettingsContext);

    if (!context) {
        throw new Error("usePlatformSettings must be used within PlatformSettingsProvider.");
    }

    return context;
}
