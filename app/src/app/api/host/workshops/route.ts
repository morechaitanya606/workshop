import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { handleApiError, parseBody } from "@/lib/api-route";
import { requireSupabaseService } from "@/lib/api-helpers";
import { jsonError, requireHostOrAdmin } from "@/lib/api-auth";
import { assertRateLimit, getRateLimitKey } from "@/lib/rate-limit";
import { workshopCreateSchema } from "@/lib/validators";
import {
    buildWorkshopInsertPayloads,
    mapWorkshopRowToWorkshop,
    sortWorkshopsBySession,
} from "@/lib/workshop-utils";
import {
    isMissingColumnError,
    isMissingApprovalStatusColumnError,
    withoutNewColumns,
    withoutApprovalStatus,
} from "@/lib/workshop-approval-compat";

export async function GET(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    try {
        const { data, error } = await serviceClient
            .from("workshops")
            .select("*")
            .eq("host_user_id", auth.user.id)
            .order("created_at", { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            data: (data || []).map((row) => mapWorkshopRowToWorkshop(row)),
        });
    } catch (error) {
        return handleApiError("Failed to load host workshops.", error);
    }
}

export async function POST(request: NextRequest) {
    const auth = await requireHostOrAdmin(request);
    if (!auth.ok) {
        return auth.response;
    }

    const rateLimitResult = await assertRateLimit({
        key: getRateLimitKey(request, "host-workshops-write", auth.user.id),
        limit: 30,
        windowMs: 60_000,
        message: "Too many workshop creation attempts. Please wait and try again.",
    });
    if (!rateLimitResult.ok) {
        return rateLimitResult.response;
    }

    const service = requireSupabaseService();
    if (!service.ok) return service.response;
    const serviceClient = service.client;

    const parsed = await parseBody(
        request,
        workshopCreateSchema,
        "Invalid JSON payload.",
        "Workshop form validation failed."
    );
    if (!parsed.ok) {
        return parsed.response;
    }

    try {
        // One row per session, inserted in a single statement so the batch is all-or-nothing.
        const payloads = buildWorkshopInsertPayloads(parsed.data, auth.user.id, {
            approvalStatus: auth.role === "admin" ? "approved" : "pending",
        });
        const multiple = payloads.length > 1;

        let usedCompatibilityMode = false;
        let { data, error } = await serviceClient.from("workshops").insert(payloads).select("*");

        if (error && isMissingApprovalStatusColumnError(error)) {
            usedCompatibilityMode = true;
            ({ data, error } = await serviceClient
                .from("workshops")
                .insert(payloads.map((payload) => withoutApprovalStatus(payload)))
                .select("*"));
        }

        if (error && isMissingColumnError(error)) {
            usedCompatibilityMode = true;
            ({ data, error } = await serviceClient
                .from("workshops")
                .insert(payloads.map((payload) => withoutNewColumns(payload)))
                .select("*"));
        }

        if (error) {
            throw error;
        }
        if (!data || data.length === 0) {
            return jsonError("Workshop creation did not return a row.", 500);
        }

        const workshops = sortWorkshopsBySession(data.map((row) => mapWorkshopRowToWorkshop(row)));

        return NextResponse.json(
            {
                workshop: workshops[0],
                workshops,
                ids: workshops.map((workshop) => workshop.id),
                message:
                    usedCompatibilityMode && auth.role !== "admin"
                        ? "Workshop created for testing. Admin approval will start once the latest database migration is applied."
                        : auth.role === "admin"
                          ? multiple
                              ? `${workshops.length} workshop sessions created successfully.`
                              : "Workshop created successfully."
                          : multiple
                            ? `${workshops.length} workshop sessions submitted for admin approval.`
                            : "Workshop submitted for admin approval.",
            },
            { status: 201 }
        );
    } catch (error) {
        return handleApiError("Failed to create workshop.", error);
    }
}
