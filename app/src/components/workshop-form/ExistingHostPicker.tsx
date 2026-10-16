"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import type { HostProfile } from "@/lib/workshop-library";

type ExistingHostPickerProps = {
    /** Loads the hosts this user may reuse. Authorisation is enforced by the endpoint. */
    loadHosts: () => Promise<HostProfile[]>;
    onSelect: (host: HostProfile) => void;
    disabled?: boolean;
};

/**
 * "Use a saved host": fills the host name, bio, experience and links from a host stored once in
 * the library, instead of typing them again for every workshop. Renders nothing when there are
 * no saved hosts (or the library is not available yet).
 */
export default function ExistingHostPicker({
    loadHosts,
    onSelect,
    disabled = false,
}: ExistingHostPickerProps) {
    const [hosts, setHosts] = useState<HostProfile[]>([]);

    useEffect(() => {
        let cancelled = false;
        loadHosts()
            .then((loaded) => {
                if (!cancelled) setHosts(loaded);
            })
            .catch(() => {
                // The host fields can still be typed by hand.
            });
        return () => {
            cancelled = true;
        };
        // Load once per page; the loader closes over the session token.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (hosts.length === 0) return null;

    return (
        <div className="md:col-span-2 rounded-xl border border-terracotta/30 bg-cream-100 p-3">
            <label
                htmlFor="saved-host"
                className="mb-2 flex items-center gap-2 text-xs font-inter font-bold uppercase tracking-wider text-dark-muted"
            >
                <UserRound className="h-4 w-4 text-terracotta" />
                Use a saved host
            </label>
            <select
                id="saved-host"
                defaultValue=""
                disabled={disabled}
                onChange={(event) => {
                    const host = hosts.find((item) => item.id === event.target.value);
                    if (host) onSelect(host);
                }}
                className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-inter"
            >
                <option value="">Select a host to fill the details below</option>
                {hosts.map((host) => (
                    <option key={host.id} value={host.id}>
                        {host.name}
                    </option>
                ))}
            </select>
            <p className="mt-1 text-xs font-inter text-dark-muted">
                A host is saved once, by name. Re-using the same name never creates a duplicate.
            </p>
        </div>
    );
}
