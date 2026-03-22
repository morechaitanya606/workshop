"use client";

import { useState, useEffect, useRef } from "react";
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    Search,
    MessageSquare,
    ChevronDown,
    X,
    Send,
    ArrowLeft,
    User,
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
    replies: Reply[];
}

interface Reply {
    id: string;
    message: string;
    author: "admin" | "user";
    created_at: string;
}

const STATUS_OPTIONS: { value: Ticket["status"]; label: string }[] = [
    { value: "open", label: "Open" },
    { value: "in_progress", label: "In Progress" },
    { value: "resolved", label: "Resolved" },
];

function formatDateTime(iso: string) {
    const date = new Date(iso);
    return date.toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function SupportDashboard() {
    const { session } = useAuth();
    const [tickets, setTickets] = useState<Ticket[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [replyDraft, setReplyDraft] = useState("");
    const [statusUpdating, setStatusUpdating] = useState(false);
    const repliesEndRef = useRef<HTMLDivElement | null>(null);

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
                replies: [],
            },
            {
                id: "2",
                subject: "Want to reschedule",
                description:
                    "I am sick and cannot make it to the pasta making class tomorrow. Can I get a refund or move my date?",
                email: "foodie22@email.com",
                status: "in_progress",
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
                replies: [
                    {
                        id: "r1",
                        message:
                            "Hi! Sorry to hear you're unwell. Let me check with the host about rescheduling options.",
                        author: "admin",
                        created_at: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
                    },
                    {
                        id: "r2",
                        message: "Thank you so much, that would be great!",
                        author: "user",
                        created_at: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
                    },
                ],
            },
            {
                id: "3",
                subject: "Do I need to bring my own clay?",
                description:
                    "Hi, just confirming if the advanced ceramics class provides the high-fire clay or if I need to buy it.",
                email: "cerami_fan@demo.inc",
                status: "resolved",
                created_at: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
                replies: [
                    {
                        id: "r3",
                        message:
                            "All materials including high-fire clay are provided by the host. You don't need to bring anything!",
                        author: "admin",
                        created_at: new Date(Date.now() - 1000 * 60 * 60 * 46).toISOString(),
                    },
                    {
                        id: "r4",
                        message: "That's perfect. Thanks for the quick reply!",
                        author: "user",
                        created_at: new Date(Date.now() - 1000 * 60 * 60 * 45).toISOString(),
                    },
                ],
            },
        ];

        const timer = setTimeout(() => {
            setTickets(mockTickets);
            setLoading(false);
        }, 800);

        return () => clearTimeout(timer);
    }, [session]);

    useEffect(() => {
        if (selectedTicketId && repliesEndRef.current) {
            repliesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [selectedTicketId, tickets]);

    const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;

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

    const getStatusBadgeClasses = (status: string) => {
        switch (status) {
            case "open":
                return "bg-amber-50 text-amber-700 border-amber-200";
            case "in_progress":
                return "bg-blue-50 text-blue-700 border-blue-200";
            case "resolved":
                return "bg-emerald-50 text-emerald-700 border-emerald-200";
            default:
                return "bg-gray-50 text-gray-700 border-gray-200";
        }
    };

    const handleStatusChange = (ticketId: string, newStatus: Ticket["status"]) => {
        setStatusUpdating(true);
        setTimeout(() => {
            setTickets((prev) =>
                prev.map((t) => (t.id === ticketId ? { ...t, status: newStatus } : t))
            );
            setStatusUpdating(false);
        }, 400);
    };

    const handleSendReply = () => {
        const trimmed = replyDraft.trim();
        if (!trimmed || !selectedTicketId) return;

        const newReply: Reply = {
            id: `r-${Date.now()}`,
            message: trimmed,
            author: "admin",
            created_at: new Date().toISOString(),
        };

        setTickets((prev) =>
            prev.map((t) =>
                t.id === selectedTicketId
                    ? {
                          ...t,
                          replies: [...t.replies, newReply],
                          status: t.status === "open" ? "in_progress" : t.status,
                      }
                    : t
            )
        );
        setReplyDraft("");
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 rounded-full border-4 border-terracotta/20 border-t-terracotta animate-spin" />
            </div>
        );
    }

    /* ═══ DETAIL VIEW ═══ */
    if (selectedTicket) {
        return (
            <div className="space-y-6">
                {/* Back button */}
                <button
                    onClick={() => {
                        setSelectedTicketId(null);
                        setReplyDraft("");
                    }}
                    className="inline-flex items-center gap-2 text-sm font-inter font-medium text-dark-muted hover:text-dark transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to all tickets
                </button>

                {/* Ticket header card */}
                <div className="bg-white rounded-2xl border border-clay/30 shadow-card p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-5">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                                {getStatusIcon(selectedTicket.status)}
                                <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-inter font-semibold border ${getStatusBadgeClasses(selectedTicket.status)}`}
                                >
                                    {getStatusLabel(selectedTicket.status)}
                                </span>
                                <span className="text-xs text-dark-muted ml-1">
                                    #{selectedTicket.id}
                                </span>
                            </div>
                            <h2 className="font-playfair font-bold text-xl sm:text-2xl text-dark mb-1">
                                {selectedTicket.subject}
                            </h2>
                            <div className="flex items-center gap-2 text-sm text-dark-muted font-inter">
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>{selectedTicket.email}</span>
                                <span className="text-dark-muted/50">·</span>
                                <span>{formatDateTime(selectedTicket.created_at)}</span>
                            </div>
                        </div>

                        {/* Status changer */}
                        <div className="flex items-center gap-2">
                            <label
                                htmlFor="status-select"
                                className="text-xs font-inter font-medium text-dark-muted whitespace-nowrap"
                            >
                                Status:
                            </label>
                            <div className="relative">
                                <select
                                    id="status-select"
                                    value={selectedTicket.status}
                                    disabled={statusUpdating}
                                    onChange={(e) =>
                                        handleStatusChange(
                                            selectedTicket.id,
                                            e.target.value as Ticket["status"]
                                        )
                                    }
                                    className="appearance-none bg-cream rounded-xl border border-clay/50 pl-3 pr-8 py-2 text-sm font-inter focus:outline-none focus:ring-1 focus:ring-terracotta/30 disabled:opacity-50"
                                >
                                    {STATUS_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>
                                            {opt.label}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-muted pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Original description */}
                    <div className="bg-cream/60 rounded-xl p-4 border border-clay/20">
                        <p className="text-sm font-inter text-dark-secondary leading-relaxed">
                            {selectedTicket.description}
                        </p>
                    </div>
                </div>

                {/* Conversation thread */}
                <div className="bg-white rounded-2xl border border-clay/30 shadow-card overflow-hidden">
                    <div className="px-6 py-4 border-b border-clay/20">
                        <h3 className="font-inter font-semibold text-sm text-dark">
                            Conversation ({selectedTicket.replies.length})
                        </h3>
                    </div>

                    {selectedTicket.replies.length > 0 ? (
                        <div className="divide-y divide-clay/10 max-h-[400px] overflow-y-auto">
                            {selectedTicket.replies.map((reply) => (
                                <div
                                    key={reply.id}
                                    className={`px-6 py-4 ${reply.author === "admin" ? "bg-blue-50/30" : "bg-white"}`}
                                >
                                    <div className="flex items-center gap-2 mb-2">
                                        <div
                                            className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${reply.author === "admin" ? "bg-terracotta" : "bg-dark/60"}`}
                                        >
                                            {reply.author === "admin" ? (
                                                "A"
                                            ) : (
                                                <User className="w-3 h-3" />
                                            )}
                                        </div>
                                        <span className="text-xs font-inter font-semibold text-dark">
                                            {reply.author === "admin" ? "Admin" : "Customer"}
                                        </span>
                                        <span className="text-xs text-dark-muted">
                                            {formatDateTime(reply.created_at)}
                                        </span>
                                    </div>
                                    <p className="text-sm font-inter text-dark-secondary leading-relaxed ml-8">
                                        {reply.message}
                                    </p>
                                </div>
                            ))}
                            <div ref={repliesEndRef} />
                        </div>
                    ) : (
                        <div className="px-6 py-10 text-center">
                            <MessageSquare className="w-8 h-8 text-dark-muted/30 mx-auto mb-2" />
                            <p className="text-sm text-dark-muted font-inter">
                                No replies yet. Send the first response below.
                            </p>
                        </div>
                    )}

                    {/* Reply input */}
                    <div className="px-6 py-4 border-t border-clay/20 bg-cream/30">
                        <div className="flex gap-3">
                            <textarea
                                value={replyDraft}
                                onChange={(e) => setReplyDraft(e.target.value)}
                                placeholder="Type your reply..."
                                rows={2}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                        e.preventDefault();
                                        handleSendReply();
                                    }
                                }}
                                className="flex-1 bg-white rounded-xl border border-clay/50 px-4 py-3 text-sm font-inter focus:outline-none focus:ring-1 focus:ring-terracotta/30 resize-none"
                            />
                            <button
                                onClick={handleSendReply}
                                disabled={!replyDraft.trim()}
                                className="self-end btn-primary !py-3 !px-5 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="text-[11px] text-dark-muted mt-2 font-inter">
                            Press Ctrl+Enter to send
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    /* ═══ LIST VIEW ═══ */
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
                                className="p-5 hover:bg-cream-100/50 transition-colors cursor-pointer"
                                onClick={() => setSelectedTicketId(ticket.id)}
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
                                            {ticket.replies.length > 0 && (
                                                <span className="inline-flex items-center gap-1 text-[11px] font-inter text-dark-muted ml-1">
                                                    <MessageSquare className="w-3 h-3" />
                                                    {ticket.replies.length}
                                                </span>
                                            )}
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
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedTicketId(ticket.id);
                                        }}
                                        className="btn-secondary !py-2 !px-4 text-xs"
                                    >
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
