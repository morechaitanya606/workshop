import type { Workshop } from "@/lib/data";

/**
 * "Try one of these instead" on a sold-out workshop: upcoming workshops of the same activity or
 * city that still have seats. One whose bookings the admin closed is no alternative, whatever
 * seats it has, so it is left out (the similar-workshops cards still list it, marked closed).
 */
export function suggestedAlternatives(
    similar: readonly Workshop[],
    current: Pick<Workshop, "id" | "category" | "city">,
    todayIso: string,
    closedIds: ReadonlyArray<string>,
    limit = 3
): Workshop[] {
    const closed = new Set(closedIds);
    return similar
        .filter(
            (item) =>
                item.id !== current.id &&
                item.seatsRemaining > 0 &&
                item.date >= todayIso &&
                !closed.has(item.id) &&
                (item.category === current.category || item.city === current.city)
        )
        .slice(0, limit);
}
