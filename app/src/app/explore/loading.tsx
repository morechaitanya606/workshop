import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import MobileNav from "@/components/MobileNav";
import { Skeleton } from "@/components/ui";

function SkeletonCard() {
    return (
        <div className="card-workshop">
            <Skeleton className="aspect-[4/3] rounded-none" />
            <div className="space-y-3 p-4">
                <Skeleton className="h-3 w-24 rounded-full" />
                <Skeleton className="h-5 w-full rounded-full" />
                <Skeleton className="h-3 w-2/3 rounded-full" />
                <Skeleton className="h-10 w-full rounded-xl" />
            </div>
        </div>
    );
}

export default function ExploreLoading() {
    return (
        <main className="min-h-screen bg-cream pb-20 md:pb-0">
            <Navbar />
            <section className="section-padding pt-28 pb-14">
                <div className="mx-auto max-w-7xl">
                    <div className="mb-8 space-y-3">
                        <Skeleton className="h-4 w-24 rounded-full" />
                        <Skeleton className="h-10 w-80 max-w-full rounded-full" />
                        <Skeleton className="h-5 w-[32rem] max-w-full rounded-full" />
                    </div>
                    <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {Array.from({ length: 6 }).map((_, index) => (
                            <Skeleton key={index} className="h-12 rounded-xl" />
                        ))}
                    </div>
                    <div className="grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <SkeletonCard key={index} />
                        ))}
                    </div>
                </div>
            </section>
            <Footer />
            <MobileNav />
        </main>
    );
}
