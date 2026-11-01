import "server-only";

import type { Json } from "@/lib/database.types";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import {
    CLOSED_WORKSHOPS_SETTING_KEY,
    parseClosedWorkshopIds,
    withBookingsClosed,
    type BookingsClosedUpdate,
} from "@/lib/workshop-availability";
import {
    readSettingSnapshot,
    writeSettingIfUnchanged,
} from "@/app/api/settings/platform-setting-cas";

/**
 * The admin switch's write of the "closed_workshop_ids" platform setting. The whole list lives in
 * one row, so two switches saved at the same moment (two workshops closed in quick succession on
 * a slow connection, or from two tabs) would each read the old list and the second save would
 * erase the first. Every attempt therefore reads the list fresh, changes this one id, and stores
 * it only if the row is still what was read (platform-setting-cas.ts); when another save got in
 * first it reads again and redoes the change on the newer list.
 */

const ROUTE = "booking_status";
/** Each retry needs a competing save in between, so a few is plenty for one owner. */
const MAX_ATTEMPTS = 5;

export type ClosedUpdateFailure = {
    ok: false;
    status: 400 | 409 | 500 | 503;
    code: "READ_FAILED" | "UNKNOWN_WORKSHOP" | "LIST_FULL" | "CONFLICT" | "SAVE_FAILED";
    error: string;
};

export type ClosedUpdate =
    | {
          ok: true;
          /** The whole stored list after the change. */
          closedWorkshopIds: string[];
          /** False when the list already said so and nothing had to be written. */
          changed: boolean;
      }
    | ClosedUpdateFailure;

function failureOf(refused: Extract<BookingsClosedUpdate, { ok: false }>): ClosedUpdateFailure {
    return {
        ok: false,
        status: refused.code === "READ_FAILED" ? 503 : 400,
        code: refused.code,
        error: refused.error,
    };
}

function sameMembers(current: ReadonlySet<string>, next: readonly string[]) {
    return current.size === next.length && next.every((id) => current.has(id));
}

/**
 * Switches one workshop's bookings off (closed: true) or back on. A failed read never writes:
 * withBookingsClosed refuses it, so a database hiccup cannot store a short list that reopens
 * other workshops. Ids of deleted workshops stay in the list and are harmless: nothing is ever
 * asked about them again, and the list is capped.
 */
export async function setWorkshopBookingsClosed(
    client: SupabaseServerClient,
    workshopId: string,
    closed: boolean
): Promise<ClosedUpdate> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const snapshot = await readSettingSnapshot(client, CLOSED_WORKSHOPS_SETTING_KEY, ROUTE);
        if (!snapshot.ok) {
            return failureOf(
                withBookingsClosed({ ok: false, ids: [] }, workshopId, closed) as Extract<
                    BookingsClosedUpdate,
                    { ok: false }
                >
            );
        }

        const current = parseClosedWorkshopIds(snapshot.value);
        const next = withBookingsClosed({ ok: true, ids: current }, workshopId, closed);
        if (!next.ok) return failureOf(next);

        // Idempotent: closing a closed workshop (or opening an open one) writes nothing.
        if (sameMembers(current, next.value)) {
            return { ok: true, closedWorkshopIds: [...current], changed: false };
        }

        const written = await writeSettingIfUnchanged(
            client,
            CLOSED_WORKSHOPS_SETTING_KEY,
            snapshot.version,
            next.value as Json,
            ROUTE
        );
        if (written.ok) return { ok: true, closedWorkshopIds: next.value, changed: true };
        if (written.reason === "error") {
            return {
                ok: false,
                status: 500,
                code: "SAVE_FAILED",
                error: "Unable to save the bookings switch right now. Nothing was changed.",
            };
        }
        // conflict: another save changed the list first, so read it again.
    }

    return {
        ok: false,
        status: 409,
        code: "CONFLICT",
        error: "Another change was saving at the same moment, so nothing was changed. Try again.",
    };
}
