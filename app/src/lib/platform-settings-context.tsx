"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { getPlatformSettings, type PlatformSettings } from "@/lib/api-client";

type PlatformSettingsContextValue = {
    settings: PlatformSettings;
    loading: boolean;
    mergeSettings: (nextSettings: Partial<PlatformSettings>) => void;
};

const PlatformSettingsContext = createContext<PlatformSettingsContextValue | null>(null);

export function PlatformSettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<PlatformSettings>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const loadSettings = async () => {
            try {
                const response = await getPlatformSettings();
                if (!cancelled) {
                    setSettings(response.settings || {});
                }
            } catch {
                if (!cancelled) {
                    setSettings((currentSettings) => currentSettings);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSettings();

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <PlatformSettingsContext.Provider
            value={{
                settings,
                loading,
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
