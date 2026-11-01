import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { Workshop } from "@/lib/data";
import {
    createSupabaseServiceClient,
    isSupabaseServiceConfigured,
    type SupabaseServerClient,
} from "@/lib/supabase-server";
import { isMissingApprovalStatusColumnError } from "@/lib/workshop-approval-compat";
import { mapWorkshopRowToWorkshop } from "@/lib/workshop-utils";

/** Each workshop query gets this long: a hung database must not hang the page. */
export const WORKSHOP_READ_TIMEOUT_MS = 5000;

export type WorkshopRead =
    | { status: "found"; workshop: Workshop }
    /** The query succeeded and there is no approved workshop with this id: a real 404. */
    | { status: "missing" }
    /** The query failed or timed out: says nothing about whether the workshop exists. */
    | { status: "failed"; error: unknown };

/** Thrown when the workshop could not be read, so Next keeps serving the last good page. */
export class WorkshopReadError extends Error {
    constructor(workshopId: string) {
        super(`Workshop ${workshopId} could not be read.`);
        this.name = "WorkshopReadError";
    }
}

/** One read of an approved workshop. Never throws. */
export async function readWorkshop(
    client: SupabaseServerClient,
    id: string
): Promise<WorkshopRead> {
    try {
        const query = (approvedOnly: boolean) => {
            let builder = client.from("workshops").select("*").eq("id", id);
            if (approvedOnly) builder = builder.eq("approval_status", "approved");
            return builder.maybeSingle();
        };

        let { data, error } = await query(true);
        if (error && isMissingApprovalStatusColumnError(error)) {
            ({ data, error } = await query(false));
        }
        if (error) return { status: "failed", error };
        if (!data) return { status: "missing" };
        return { status: "found", workshop: mapWorkshopRowToWorkshop(data) };
    } catch (error) {
        return { status: "failed", error };
    }
}

function isProductionBuild() {
    return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * The workshop for its page, or null when it does not exist (or is not approved): only then may
 * the page answer 404. A failed or slow read is tried once more; if that fails too this THROWS,
 * so an ISR regeneration keeps serving the last good page (and a first visit gets the segment's
 * error boundary with "Try again") instead of a cached 404 for a live workshop.
 * During `next build` a failure returns null (the page renders on demand later) rather than
 * failing the whole deployment over one slow query.
 */
export async function loadWorkshop(
    id: string,
    createClient: () => SupabaseServerClient = () =>
        createSupabaseServiceClient({ requestTimeoutMs: WORKSHOP_READ_TIMEOUT_MS })
): Promise<Workshop | null> {
    if (!isSupabaseServiceConfigured) return null;

    let result: WorkshopRead;
    try {
        result = await readWorkshop(createClient(), id);
        if (result.status === "failed") {
            result = await readWorkshop(createClient(), id);
        }
    } catch (error) {
        result = { status: "failed", error };
    }

    if (result.status === "found") return result.workshop;
    if (result.status === "missing") return null;

    Sentry.captureException(result.error, {
        tags: { layer: "web", route: "workshop_detail" },
    });
    if (isProductionBuild()) return null;
    throw new WorkshopReadError(id);
}
