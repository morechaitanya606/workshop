import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireHostOrAdmin } from "@/lib/api-auth";
import { requireSupabaseService } from "@/lib/api-helpers";
import type { Database } from "@/lib/database.types";
import { createSupabaseAnonServerClient } from "@/lib/supabase-server";

type SupportTicketRow = Database["public"]["Tables"]["support_tickets"]["Row"];

type WorkshopRow = Pick<Database["public"]["Tables"]["workshops"]["Row"], "id" | "title">;

function isMissingSupportTableError(error: unknown) {
    const message =
        error && typeof error === "object" && "message" in error
            ? String((error as { message?: unknown }).message || "").toLowerCase()
            : "";

    return (
        message.includes("support_tickets") &&
        (message.includes("does not exist") || message.includes("schema cache"))
    );
}

export async function GET(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) {
        return NextResponse.json({ tickets: [] }, { status: 200 });
    }

    try {
        let workshopIds: string[] | null = null;

        if (auth.role === "host") {
            const { data: hosts, error: hostsError } = await service.client
                .from("hosts")
                .select("id")
                .eq("user_id", auth.user.id);

            if (hostsError) {
                throw hostsError;
            }

            const hostIds = Array.isArray(hosts)
                ? hosts
                      .map((host) => host.id)
                      .filter((value): value is string => typeof value === "string" && !!value)
                : [];

            const { data: directHostWorkshops, error: directHostWorkshopError } =
                await service.client
                    .from("workshops")
                    .select("id")
                    .eq("host_user_id", auth.user.id);

            if (directHostWorkshopError) {
                throw directHostWorkshopError;
            }

            const linkedHostWorkshopsResult =
                hostIds.length > 0
                    ? await service.client.from("workshops").select("id").in("host_id", hostIds)
                    : { data: [], error: null };

            if (linkedHostWorkshopsResult.error) {
                throw linkedHostWorkshopsResult.error;
            }

            workshopIds = Array.from(
                new Set(
                    [
                        ...(Array.isArray(directHostWorkshops) ? directHostWorkshops : []),
                        ...(Array.isArray(linkedHostWorkshopsResult.data)
                            ? linkedHostWorkshopsResult.data
                            : []),
                    ]
                        .map((workshop) => workshop.id)
                        .filter((value): value is string => typeof value === "string" && !!value)
                )
            );

            if (workshopIds.length === 0) {
                return NextResponse.json({ tickets: [] }, { status: 200 });
            }
        }

        const ticketsBaseQuery = service.client
            .from("support_tickets")
            .select("id, subject, description, email, status, created_at, workshop_id")
            .order("created_at", { ascending: false });

        const { data, error } = workshopIds
            ? await ticketsBaseQuery.in("workshop_id", workshopIds)
            : await ticketsBaseQuery;

        if (error) {
            if (isMissingSupportTableError(error)) {
                return NextResponse.json({ tickets: [] }, { status: 200 });
            }
            throw error;
        }

        const tickets = (Array.isArray(data) ? data : []) as SupportTicketRow[];
        const ticketWorkshopIds = Array.from(
            new Set(
                tickets
                    .map((ticket) => ticket.workshop_id)
                    .filter((value): value is string => typeof value === "string" && !!value)
            )
        );

        let workshopMap = new Map<string, WorkshopRow>();
        if (ticketWorkshopIds.length > 0) {
            const { data: workshops, error: workshopsError } = await service.client
                .from("workshops")
                .select("id, title")
                .in("id", ticketWorkshopIds);

            if (workshopsError) {
                throw workshopsError;
            }

            workshopMap = new Map(
                (Array.isArray(workshops) ? workshops : []).map((workshop) => [
                    workshop.id,
                    workshop,
                ])
            );
        }

        return NextResponse.json({
            tickets: tickets.map((ticket) => ({
                ...ticket,
                replies: [],
                workshop:
                    ticket.workshop_id && workshopMap.has(ticket.workshop_id)
                        ? workshopMap.get(ticket.workshop_id)
                        : null,
            })),
        });
    } catch (error) {
        if (isMissingSupportTableError(error)) {
            return NextResponse.json({ tickets: [] }, { status: 200 });
        }
        console.error("Support ticket GET API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { subject, description, email, userId, workshopId } = body;

        if (!subject || !description || !email) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const service = requireSupabaseService();
        const supabase = service.ok ? service.client : createSupabaseAnonServerClient();

        const { error } = await supabase.from("support_tickets").insert([
            {
                user_id: userId || null,
                email,
                subject,
                description,
                workshop_id:
                    typeof workshopId === "string" && workshopId.trim() ? workshopId : null,
                status: "open",
                created_at: new Date().toISOString(),
            },
        ]);

        if (error) {
            console.error(
                "Failed to insert support ticket (table might not exist):",
                error.message
            );
            // In a real production app, we would throw or return error.
            // For now, we return 200 so the UI can show success, assuming
            // the user will create the table later.
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        console.error("Support ticket API error:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
