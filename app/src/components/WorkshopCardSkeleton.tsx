export default function WorkshopCardSkeleton() {
    return (
        <div className="card-workshop animate-pulse">
            {/* Image placeholder */}
            <div className="aspect-[4/3] bg-gray-200 rounded-t-2xl" />

            {/* Content */}
            <div className="p-4 space-y-3">
                {/* Date */}
                <div className="h-3 w-28 bg-gray-200 rounded-full" />

                {/* Title */}
                <div className="space-y-2">
                    <div className="h-5 w-full bg-gray-200 rounded-full" />
                    <div className="h-5 w-3/4 bg-gray-200 rounded-full" />
                </div>

                {/* Description */}
                <div className="h-3 w-2/3 bg-gray-200 rounded-full" />

                {/* Badges */}
                <div className="flex gap-1.5">
                    <div className="h-5 w-24 bg-gray-200 rounded-full" />
                    <div className="h-5 w-20 bg-gray-200 rounded-full" />
                </div>

                {/* Host */}
                <div className="flex items-center gap-1.5">
                    <div className="h-4 w-4 bg-gray-200 rounded-full" />
                    <div className="h-3 w-32 bg-gray-200 rounded-full" />
                </div>

                {/* Bottom row */}
                <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                    <div className="h-4 w-16 bg-gray-200 rounded-full" />
                    <div className="h-5 w-14 bg-gray-200 rounded-full" />
                </div>

                {/* Seat badge */}
                <div className="h-5 w-24 bg-gray-200 rounded-full" />
            </div>
        </div>
    );
}
