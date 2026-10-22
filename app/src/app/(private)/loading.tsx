import { Skeleton } from "@/components/ui";

// Lives here, not at the app root: a root loading.tsx wraps every public page in Suspense, so the
// response streams with 200 before notFound() runs and missing workshops became soft 404s.
// booking/ and (public)/explore/ keep their own loading files.
export default function Loading() {
    return (
        <main className="section-padding min-h-[70vh] py-20">
            <div className="mx-auto max-w-6xl space-y-8">
                <div className="space-y-4">
                    <Skeleton className="h-4 w-28 rounded-full" />
                    <Skeleton className="h-12 w-full max-w-2xl rounded-[28px]" />
                    <Skeleton className="h-5 w-full max-w-xl rounded-full" />
                </div>
                <div className="grid gap-6 lg:grid-cols-[1.25fr,0.75fr]">
                    <Skeleton className="h-[24rem] rounded-[32px]" />
                    <div className="space-y-4">
                        <Skeleton className="h-28 rounded-[28px]" />
                        <Skeleton className="h-40 rounded-[28px]" />
                        <Skeleton className="h-24 rounded-[28px]" />
                    </div>
                </div>
            </div>
        </main>
    );
}
