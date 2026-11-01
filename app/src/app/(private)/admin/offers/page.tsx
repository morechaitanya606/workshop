"use client";

import AdminShell from "@/components/admin/AdminShell";
import OffersManager from "@/components/admin/OffersManager";
import { useAuth } from "@/lib/auth-context";

export default function AdminOffersPage() {
    const { session } = useAuth();

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="mb-2 text-xs font-inter font-bold uppercase tracking-wider text-terracotta">
                    Admin
                </p>
                <h1 className="heading-md">Offers</h1>
                <p className="mt-1 text-body text-dark-muted">
                    Coupon codes and offers shown on cards, workshop pages and checkout. You can
                    also add and edit a workshop&apos;s offers on its own Edit page.
                </p>
            </div>

            <OffersManager accessToken={session?.access_token} />
        </AdminShell>
    );
}
