"use server";

import type { Workshop } from "@/lib/data";
import { PAST_WORKSHOPS_PAGE_SIZE, loadPastWorkshops } from "@/lib/workshop-page-data";

export type PastEventsPageResult = {
    workshops: Workshop[];
    total: number;
    ok: boolean;
};

/** Server action behind the "Load more" button on /past-events. */
export async function loadMorePastEvents(page: number): Promise<PastEventsPageResult> {
    const safePage = Number.isInteger(page) && page > 1 ? Math.min(page, 200) : 2;
    const result = await loadPastWorkshops(safePage, PAST_WORKSHOPS_PAGE_SIZE);

    return {
        workshops: result.data,
        total: result.total,
        ok: result.source !== "error",
    };
}
