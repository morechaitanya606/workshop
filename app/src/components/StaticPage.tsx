import Link from "next/link";
import type { ReactNode } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

interface StaticPageProps {
    title: string;
    description: string;
    children?: ReactNode;
}

export default function StaticPage({
    title,
    description,
    children,
}: StaticPageProps) {
    return (
        <main className="min-h-screen bg-cream">
            <Navbar />
            <section className="pt-28 pb-16 section-padding">
                <div className="max-w-3xl mx-auto">
                    <h1 className="heading-lg mb-3">{title}</h1>
                    <p className="text-body text-dark-muted mb-8">{description}</p>
                    {children ? (
                        <div className="space-y-6 text-body text-dark-secondary">
                            {children}
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-soft p-6">
                            <p className="text-body text-dark-muted">
                                This page is being prepared for launch.
                            </p>
                        </div>
                    )}
                    <div className="mt-10">
                        <Link href="/explore" className="btn-primary">
                            Explore Workshops
                        </Link>
                    </div>
                </div>
            </section>
            <Footer />
        </main>
    );
}
