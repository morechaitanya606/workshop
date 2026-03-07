"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogOut } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import { useAuth } from "@/lib/auth-context";

export default function AdminSettingsPage() {
    const router = useRouter();
    const { user, signOut } = useAuth();
    const [signingOut, setSigningOut] = useState(false);

    const handleSignOut = async () => {
        setSigningOut(true);
        try {
            await signOut();
            router.replace("/");
        } finally {
            setSigningOut(false);
        }
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2">
                    Admin
                </p>
                <h1 className="heading-md">Settings</h1>
            </div>

            <div className="max-w-2xl bg-white rounded-2xl shadow-soft p-6">
                <div className="space-y-5">
                    <div>
                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                            Full Name
                        </label>
                        <input
                            type="text"
                            value={user?.user_metadata?.full_name || ""}
                            readOnly
                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                            Email
                        </label>
                        <input
                            type="email"
                            value={user?.email || ""}
                            readOnly
                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter text-dark"
                        />
                    </div>

                    <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="btn-secondary disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {signingOut ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Signing out...
                            </>
                        ) : (
                            <>
                                <LogOut className="w-4 h-4" />
                                Sign Out
                            </>
                        )}
                    </button>
                </div>
            </div>
        </AdminShell>
    );
}
