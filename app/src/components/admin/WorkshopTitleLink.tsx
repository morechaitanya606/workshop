import Link from "next/link";
import type { Workshop } from "@/lib/data";

/**
 * A workshop's name in an admin list. It opens the workshop's public event page, which exists
 * only once the workshop is approved: a pending or rejected one stays plain text, because its
 * page would answer "not found".
 */
export default function WorkshopTitleLink({
    workshop,
    className = "",
}: {
    workshop: Pick<Workshop, "id" | "title" | "approvalStatus">;
    className?: string;
}) {
    const hasEventPage =
        workshop.approvalStatus === undefined || workshop.approvalStatus === "approved";
    if (!hasEventPage) return <>{workshop.title}</>;

    return (
        <Link
            href={`/workshop/${workshop.id}`}
            title="Open the workshop event page"
            className={`rounded transition-colors hover:text-terracotta hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terracotta ${className}`}
        >
            {workshop.title}
        </Link>
    );
}
