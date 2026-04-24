"use client";

import { Headphones } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import SupportDashboard from "@/components/SupportDashboard";

export default function AdminSupportPage() {
    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2 flex items-center gap-2">
                    <Headphones className="w-4 h-4" />
                    Admin Panel
                </p>
                <h1 className="heading-md">Platform Support Tickets</h1>
                <p className="text-sm font-inter text-dark-muted max-w-2xl mt-2">
                    Manage all support queries across the platform. View and escalate user issues
                    regarding bookings, payments, and host interactions.
                </p>
            </div>
            <SupportDashboard />
        </AdminShell>
    );
}
