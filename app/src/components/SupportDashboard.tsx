"use client";

import { useEffect, useRef, useState } from "react";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle2,
    ChevronDown,
    Clock,
    MessageSquare,
    Search,
    Send,
    User,
} from "lucide-react";
import EmptyState from "@/components/ui/EmptyState";
import { getSupportTickets, toApiErrorMessage, type SupportTicket } from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

type Reply = {
    id: string;
    message: string;
    author: "admin" | "user";
    created_at: string;
};

type Ticket = SupportTicket & {
    replies: Reply[];
};

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
    const [error, setError] = useState<string | null>(null);
    const [filter, setFilter] = useState("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
    const [replyDraft, setReplyDraft] = useState("");
    const [statusUpdating, setStatusUpdating] = useState(false);
    const repliesEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!session?.access_token) {
            return;
        }

        let cancelled = false;

        const loadTickets = async () => {
            setLoading(true);
            setError(null);

            try {
                const result = await getSupportTickets(session.access_token);
                if (!cancelled) {
                    setTickets(
                        Array.isArray(result.tickets)
                            ? result.tickets.map((ticket) => ({
                                  ...ticket,
                                  replies: Array.isArray(ticket.replies) ? ticket.replies : [],
                              }))
                            : []
                    );
                }
            } catch (loadError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(loadError, "Unable to load support tickets."));
                    setTickets([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadTickets();

        return () => {
            cancelled = true;
        };
    }, [session?.access_token]);

    useEffect(() => {
        if (selectedTicketId && repliesEndRef.current) {
            repliesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [selectedTicketId, tickets]);

    const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) || null;

    const filteredTickets = tickets.filter((ticket) => {
        const matchesFilter = filter === "all" || ticket.status === filter;
        const searchValue = searchQuery.toLowerCase();
        const matchesSearch =
            ticket.subject.toLowerCase().includes(searchValue) ||
            ticket.email.toLowerCase().includes(searchValue) ||
            ticket.workshop?.title?.toLowerCase().includes(searchValue);
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
                prev.map((ticket) =>
                    ticket.id === ticketId ? { ...ticket, status: newStatus } : ticket
                )
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
            prev.map((ticket) =>
                ticket.id === selectedTicketId
                    ? {
                          ...ticket,
                          replies: [...ticket.replies, newReply],
                          status: ticket.status === "open" ? "in_progress" : ticket.status,
                      }
                    : ticket
            )
        );
        setReplyDraft("");
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-terracotta/20 border-t-terracotta" />
            </div>
        );
    }

    if (error) {
        return (
            <EmptyState icon={MessageSquare} title="Unable to load tickets" description={error} />
        );
    }

    if (selectedTicket) {
        return (
            <div className="space-y-6">
                <button
                    onClick={() => {
                        setSelectedTicketId(null);
                        setReplyDraft("");
                    }}
                    className="inline-flex items-center gap-2 text-sm font-inter font-medium text-dark-muted transition-colors hover:text-dark"
                >
                    <ArrowLeft className="w-4 h-4" />
                    Back to all tickets
                </button>

                <div className="rounded-2xl border border-clay/30 bg-white p-6 shadow-card">
                    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex-1">
                            <div className="mb-2 flex items-center gap-2">
                                {getStatusIcon(selectedTicket.status)}
                                <span
                                    className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-inter font-semibold ${getStatusBadgeClasses(selectedTicket.status)}`}
                                >
                                    {getStatusLabel(selectedTicket.status)}
                                </span>
                                <span className="ml-1 text-xs text-dark-muted">
                                    #{selectedTicket.id}
                                </span>
                            </div>
                            <h2 className="mb-1 font-playfair text-xl font-bold text-dark sm:text-2xl">
                                {selectedTicket.subject}
                            </h2>
                            <div className="flex flex-wrap items-center gap-2 text-sm font-inter text-dark-muted">
                                <MessageSquare className="w-3.5 h-3.5" />
                                <span>{selectedTicket.email}</span>
                                {selectedTicket.workshop?.title && (
                                    <>
                                        <span className="text-dark-muted/50">·</span>
                                        <span>{selectedTicket.workshop.title}</span>
                                    </>
                                )}
                                <span className="text-dark-muted/50">·</span>
                                <span>{formatDateTime(selectedTicket.created_at)}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <label
                                htmlFor="status-select"
                                className="whitespace-nowrap text-xs font-inter font-medium text-dark-muted"
                            >
                                Status:
                            </label>
                            <div className="relative">
                                <select
                                    id="status-select"
                                    value={selectedTicket.status}
                                    disabled={statusUpdating}
                                    onChange={(event) =>
                                        handleStatusChange(
                                            selectedTicket.id,
                                            event.target.value as Ticket["status"]
                                        )
                                    }
                                    className="appearance-none rounded-xl border border-clay/50 bg-cream py-2 pl-3 pr-8 text-sm font-inter focus:outline-none focus:ring-1 focus:ring-terracotta/30 disabled:opacity-50"
                                >
                                    {STATUS_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-dark-muted" />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-clay/20 bg-cream/60 p-4">
                        <p className="text-sm font-inter leading-relaxed text-dark-secondary">
                            {selectedTicket.description}
                        </p>
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-clay/30 bg-white shadow-card">
                    <div className="border-b border-clay/20 px-6 py-4">
                        <h3 className="text-sm font-inter font-semibold text-dark">
                            Conversation ({selectedTicket.replies.length})
                        </h3>
                    </div>

                    {selectedTicket.replies.length > 0 ? (
                        <div className="max-h-[400px] divide-y divide-clay/10 overflow-y-auto">
                            {selectedTicket.replies.map((reply) => (
                                <div
                                    key={reply.id}
                                    className={
                                        reply.author === "admin"
                                            ? "bg-blue-50/30 px-6 py-4"
                                            : "bg-white px-6 py-4"
                                    }
                                >
                                    <div className="mb-2 flex items-center gap-2">
                                        <div
                                            className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white ${
                                                reply.author === "admin"
                                                    ? "bg-terracotta"
                                                    : "bg-dark/60"
                                            }`}
                                        >
                                            {reply.author === "admin" ? (
                                                "A"
                                            ) : (
                                                <User className="h-3 w-3" />
                                            )}
                                        </div>
                                        <span className="text-xs font-inter font-semibold text-dark">
                                            {reply.author === "admin" ? "Admin" : "Customer"}
                                        </span>
                                        <span className="text-xs text-dark-muted">
                                            {formatDateTime(reply.created_at)}
                                        </span>
                                    </div>
                                    <p className="ml-8 text-sm font-inter leading-relaxed text-dark-secondary">
                                        {reply.message}
                                    </p>
                                </div>
                            ))}
                            <div ref={repliesEndRef} />
                        </div>
                    ) : (
                        <div className="px-6 py-10 text-center">
                            <MessageSquare className="mx-auto mb-2 h-8 w-8 text-dark-muted/30" />
                            <p className="text-sm font-inter text-dark-muted">
                                No replies yet. Send the first response below.
                            </p>
                        </div>
                    )}

                    <div className="border-t border-clay/20 bg-cream/30 px-6 py-4">
                        <div className="flex gap-3">
                            <textarea
                                value={replyDraft}
                                onChange={(event) => setReplyDraft(event.target.value)}
                                placeholder="Type your reply..."
                                rows={2}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                                        event.preventDefault();
                                        handleSendReply();
                                    }
                                }}
                                className="flex-1 resize-none rounded-xl border border-clay/50 bg-white px-4 py-3 text-sm font-inter focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                            />
                            <button
                                onClick={handleSendReply}
                                disabled={!replyDraft.trim()}
                                className="btn-primary self-end !px-5 !py-3 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                        </div>
                        <p className="mt-2 text-[11px] font-inter text-dark-muted">
                            Press Ctrl+Enter to send
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-muted" />
                    <input
                        type="text"
                        placeholder="Search tickets by subject, email, or workshop..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="w-full rounded-xl border border-clay/50 bg-cream py-2 pl-10 pr-4 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                    />
                </div>
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            className="appearance-none rounded-xl border border-clay/50 bg-cream py-2 pl-4 pr-10 text-sm focus:outline-none focus:ring-1 focus:ring-terracotta/30"
                        >
                            <option value="all">All statuses</option>
                            <option value="open">Open</option>
                            <option value="in_progress">In Progress</option>
                            <option value="resolved">Resolved</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-muted" />
                    </div>
                </div>
            </div>

            {filteredTickets.length > 0 ? (
                <div className="overflow-hidden rounded-2xl border border-clay/30 bg-white shadow-card">
                    <div className="divide-y divide-clay/20">
                        {filteredTickets.map((ticket) => (
                            <div
                                key={ticket.id}
                                className="cursor-pointer p-5 transition-colors hover:bg-cream-100/50"
                                onClick={() => setSelectedTicketId(ticket.id)}
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="mb-1 flex flex-wrap items-center gap-2">
                                            {getStatusIcon(ticket.status)}
                                            <span className="text-xs font-inter font-medium uppercase tracking-wider text-dark-secondary">
                                                {getStatusLabel(ticket.status)}
                                            </span>
                                            <span className="ml-2 text-xs text-dark-muted">
                                                {new Date(ticket.created_at).toLocaleDateString()}
                                            </span>
                                            {ticket.replies.length > 0 && (
                                                <span className="ml-1 inline-flex items-center gap-1 text-[11px] font-inter text-dark-muted">
                                                    <MessageSquare className="h-3 w-3" />
                                                    {ticket.replies.length}
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="mb-2 font-playfair text-lg font-semibold text-dark">
                                            {ticket.subject}
                                        </h4>
                                        <p className="mb-3 line-clamp-2 text-sm font-inter text-dark-muted">
                                            {ticket.description}
                                        </p>
                                        <div className="flex flex-wrap items-center gap-4 text-xs font-inter text-dark-secondary">
                                            <div className="flex items-center gap-1.5">
                                                <MessageSquare className="h-3.5 w-3.5" />
                                                <span>{ticket.email}</span>
                                            </div>
                                            {ticket.workshop?.title && (
                                                <div className="flex items-center gap-1.5">
                                                    <span>Workshop:</span>
                                                    <span>{ticket.workshop.title}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            setSelectedTicketId(ticket.id);
                                        }}
                                        className="btn-secondary !px-4 !py-2 text-xs"
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
