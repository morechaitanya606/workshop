import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError, requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { supportTicketReplySchema } from "@/lib/validators";

type Params = {
    params: Promise<{ id: string }>;
};

async function hostCanAccessTicket(
    serviceClient: SupabaseServerClient,
    userId: string,
    workshopId: string | null
) {
    if (!workshopId) return false;

    const { data: directWorkshop, error: directError } = await serviceClient
        .from("workshops")
        .select("id")
        .eq("id", workshopId)
        .eq("host_user_id", userId)
        .maybeSingle();

    if (directError) {
        throw directError;
    }
    if (directWorkshop?.id) {
        return true;
    }

    const { data: hosts, error: hostsError } = await serviceClient
        .from("hosts")
        .select("id")
        .eq("user_id", userId);

    if (hostsError) {
        throw hostsError;
    }

    const hostIds = (hosts || [])
        .map((host) => host.id)
        .filter((value): value is string => typeof value === "string" && value.length > 0);

    if (hostIds.length === 0) {
        return false;
    }

    const { data: linkedWorkshop, error: linkedError } = await serviceClient
        .from("workshops")
        .select("id")
        .eq("id", workshopId)
        .in("host_id", hostIds)
        .maybeSingle();

    if (linkedError) {
        throw linkedError;
    }

    return Boolean(linkedWorkshop?.id);
}

export async function POST(request: NextRequest, { params }: Params) {
    const { id } = await params;
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        supportTicketReplySchema,
        "Invalid JSON payload.",
        "Support ticket reply is invalid."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        const { data: ticket, error: ticketError } = await serviceClient
            .from("support_tickets")
            .select("id, workshop_id, status")
            .eq("id", id)
            .maybeSingle();

        if (ticketError) {
            throw ticketError;
        }
        if (!ticket) {
            return jsonError("Support ticket not found.", 404);
        }

        if (
            auth.role !== "admin" &&
            !(await hostCanAccessTicket(serviceClient, auth.user.id, ticket.workshop_id))
        ) {
            return jsonError("Host access is required for this support ticket.", 403);
        }

        const { data: reply, error: insertError } = await serviceClient
            .from("support_ticket_replies")
            .insert({
                ticket_id: id,
                author_user_id: auth.user.id,
                author_role: auth.role === "admin" ? "admin" : "host",
                message: parsed.data.message,
            })
            .select("id, message, author_role, created_at")
            .single();

        if (insertError) {
            throw insertError;
        }

        let status = ticket.status;
        if (status === "open") {
            const { data: updatedTicket, error: updateError } = await serviceClient
                .from("support_tickets")
                .update({ status: "in_progress" })
                .eq("id", id)
                .select("status")
                .single();

            if (updateError) {
                throw updateError;
            }
            status = updatedTicket.status;
        }

        return NextResponse.json(
            {
                reply: {
                    id: reply.id,
                    message: reply.message,
                    author: reply.author_role,
                    created_at: reply.created_at,
                },
                ticket: {
                    id,
                    status,
                },
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to create support ticket reply.", error);
    }
}
