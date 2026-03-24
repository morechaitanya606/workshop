import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function NotFound() {
    return (
        <main className="min-h-screen bg-cream">
            <Navbar />
            <section className="section-padding pt-32 pb-20">
                <div className="mx-auto max-w-2xl rounded-[2rem] border border-clay/30 bg-white p-8 text-center shadow-soft sm:p-12">
                    <p className="text-xs font-inter font-bold uppercase tracking-[0.24em] text-terracotta">
                        404
                    </p>
                    <h1 className="mt-4 heading-lg">This page wandered off the schedule</h1>
                    <p className="mt-4 text-body text-dark-muted">
                        The page you are looking for is unavailable, moved, or may never have been
                        published.
                    </p>
                    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
                        <Link href="/explore" className="btn-primary">
                            Explore Workshops
                        </Link>
                        <Link href="/" className="btn-secondary">
                            Go Home
                        </Link>
                    </div>
                </div>
            </section>
            <Footer />
        </main>
    );
}
