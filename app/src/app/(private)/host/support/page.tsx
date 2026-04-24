"use client";

import { MessageSquare } from "lucide-react";
import HostShell from "@/components/host/HostShell";
import SupportDashboard from "@/components/SupportDashboard";

export default function HostSupportPage() {
    return (
        <HostShell>
            <div className="mb-8">
                <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-2 flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Host Dashboard
                </p>
                <h1 className="heading-md">Support Tickets</h1>
                <p className="text-sm font-inter text-dark-muted max-w-2xl mt-2">
                    Manage support queries and issues from your workshop attendees. Fast responses
                    help build trust and improve your ratings.
                </p>
            </div>
            <SupportDashboard />
        </HostShell>
    );
}
