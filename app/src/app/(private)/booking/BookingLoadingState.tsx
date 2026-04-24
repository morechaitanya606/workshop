import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Skeleton } from "@/components/ui";

function SkeletonLine({ className }: { className: string }) {
    return <Skeleton className={className} />;
}

export default function BookingLoadingState() {
    return (
        <main className="min-h-screen bg-cream">
            <Navbar />
            <section className="section-padding pt-24 pb-16">
                <div className="mx-auto max-w-6xl">
                    <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-soft">
                        <SkeletonLine className="h-8 w-full" />
                    </div>
                    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[1fr,380px] lg:gap-12">
                        <div className="rounded-2xl bg-white p-6 shadow-soft space-y-5">
                            <SkeletonLine className="h-8 w-40" />
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <SkeletonLine className="h-12 w-full" />
                                <SkeletonLine className="h-12 w-full" />
                            </div>
                            <SkeletonLine className="h-12 w-full" />
                            <SkeletonLine className="h-12 w-full" />
                            <SkeletonLine className="h-24 w-full" />
                            <SkeletonLine className="h-12 w-52" />
                        </div>
                        <div className="rounded-2xl bg-white p-6 shadow-soft space-y-4">
                            <SkeletonLine className="h-6 w-32" />
                            <SkeletonLine className="h-24 w-full" />
                            <SkeletonLine className="h-28 w-full" />
                            <SkeletonLine className="h-36 w-full" />
                        </div>
                    </div>
                </div>
            </section>
            <Footer />
        </main>
    );
}
