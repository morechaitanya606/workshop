"use client";

import { useState, useEffect } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    Search,
    MessageSquare,
    ChevronDown,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { useAuth } from "@/lib/auth-context";

interface Ticket {
    id: string;
    subject: string;
    description: string;
    email: string;
    status: "open" | "in_progress" | "resolved";
    created_at: string;
}

export default function SupportDashboard() {
    const { session } = useAuth();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");

    // Mock data for the dashboard demonstration since table might not exist
    useEffect(() => {
        const mockTickets: Ticket[] = [
            {
                id: "1",
                subject: "Payment deducted but no confirmation",
                description:
                    "I tried booking the Pottery basics workshop but my internet dropped. Razorpay cut the money but I didn't get an email.",
                email: "customer1@example.com",
                status: "open",
                created_at: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
            },
            {
                id: "2",
                subject: "Want to reschedule",
                description:
                    "I am sick and cannot make it to the pasta making class tomorrow. Can I get a refund or move my date?",
                email: "foodie22@email.com",
                status: "in_progress",
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
            },
            {
                id: "3",
                subject: "Do I need to bring my own clay?",
                description:
                    "Hi, just confirming if the advanced ceramics class provides the high-fire clay or if I need to buy it.",
                email: "cerami_fan@demo.inc",
                status: "resolved",
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
            },
        ];

        // Simulate network load
        const timer = setTimeout(() => {
            setTickets(mockTickets);
            setLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [session]);

    const filteredTickets = tickets.filter((ticket) => {
        const matchesFilter = filter === "all" || ticket.status === filter;
        const matchesSearch =
            ticket.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
            ticket.email.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesFilter && matchesSearch;
    });

    const getStatusIcon = (status: string) => {
        switch (status) {
            case "open":
                return <AlertTriangle className="w-4 h-4 text-amber-500" />;
            case "in_progress":
                return <Clock className="w-4 h-4 text-blue-500" />;
            case "resolved":
                return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
            default:
                return null;
        }
    };

    const getStatusLabel = (status: string) => {
        switch (status) {
            case "open":
                return "Open";
            case "in_progress":
                return "In Progress";
            case "resolved":
                return "Resolved";
            default:
                return status;
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 rounded-full border-4 border-terracotta/20 border-t-terracotta animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row justify-between gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted" />
                    <input
                        type="text"
                        placeholder="Search tickets by subject or email..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-cream rounded-xl border border-clay/50 pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select
                            value={filter}
                            onChange={(e) => setFilter(e.target.value)}
                            className="appearance-none bg-cream rounded-xl border border-clay/50 pl-4 pr-10 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                        >
                            <option value="all">All statuses</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-muted pointer-events-none" />
                    </div>
                </div>
            </div>

            {filteredTickets.length > 0 ? (
                <div className="bg-white rounded-2xl border border-clay/30 shadow-card overflow-hidden">
                    <div className="divide-y divide-clay/20">
                        {filteredTickets.map((ticket) => (
                            <div
                                key={ticket.id}
                                className="p-5 hover:bg-cream-100/50 transition-colors"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            {getStatusIcon(ticket.status)}
                                            <span className="text-xs font-inter font-medium uppercase tracking-wider text-dark-secondary">
                                                {getStatusLabel(ticket.status)}
                                            </span>
                                            <span className="text-xs text-dark-muted ml-2">
                                                {new Date(ticket.created_at).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h4 className="font-playfair font-semibold text-lg text-dark mb-2">
                                            {ticket.subject}
                                        </h4>
                                        <p className="text-sm font-inter text-dark-muted line-clamp-2 mb-3">
                                            {ticket.description}
                                        </p>
                                        <div className="flex items-center gap-4 text-xs font-inter text-dark-secondary">
                                            <div className="flex items-center gap-1.5">
                                                <MessageSquare className="w-3.5 h-3.5" />
                                                <span>{ticket.email}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <button className="btn-secondary !py-2 !px-4 text-xs">
                                        View Details
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <EmptyState
                    icon={MessageSquare}
                    title="No tickets found"
                    description="There are no support tickets matching your current search or filter criteria."
                />
            )}
        </div>
    );
}
