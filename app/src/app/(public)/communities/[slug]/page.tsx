import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
    ArrowLeft,
    ArrowRight,
    Globe,
    Mail,
    MapPin,
    MessageCircle,
    Phone,
    Sparkles,
    Users,
} from "lucide-react";
import Footer from "@/components/Footer";
import CommunityListCard from "@/components/communities/CommunityListCard";
import CommunitySpotlightCard from "@/components/communities/CommunitySpotlightCard";
import { getCommunitySocialPreviewImage } from "@/lib/communities";
import { loadPublicCommunityBySlug, loadRelatedPublicCommunities } from "@/lib/community-page-data";
import { getAbsoluteUrl } from "@/lib/env";

export const revalidate = 60;

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>;
}): Promise<Metadata> {
    const { slug } = await params;
    const { community } = await loadPublicCommunityBySlug(slug);

    if (!community) {
        return { title: "Community Not Found | Only Workshops" };
    }

    const socialPreviewImage = getCommunitySocialPreviewImage(community.coverImage);
    const canonicalUrl = getAbsoluteUrl(`/communities/${community.slug}`);
    const socialPreviewUrl = socialPreviewImage.startsWith("http")
        ? socialPreviewImage
        : getAbsoluteUrl(socialPreviewImage);

    return {
        title: `${community.title} | Only Workshops`,
        description: community.summary,
        alternates: {
            canonical: canonicalUrl,
        },
        openGraph: {
            title: community.title,
            description: community.summary,
            url: canonicalUrl,
            type: "website",
            images: [{ url: socialPreviewUrl }],
        },
        twitter: {
            card: "summary_large_image",
            title: community.title,
            description: community.summary,
            images: [socialPreviewUrl],
        },
    };
}

export default async function CommunityDetailPage({
    params,
}: {
    params: Promise<{ slug: string }>;
}) {
    const { slug } = await params;
    const { community } = await loadPublicCommunityBySlug(slug);

    if (!community) {
        notFound();
    }

    const similarCommunities = await loadRelatedPublicCommunities(community);

    const socialLinks = [
        community.instagramUrl
            ? { href: community.instagramUrl, label: "Instagram", icon: MessageCircle }
            : null,
        community.websiteUrl ? { href: community.websiteUrl, label: "Website", icon: Globe } : null,
        community.whatsappUrl
            ? { href: community.whatsappUrl, label: "WhatsApp", icon: MessageCircle }
            : null,
    ].filter(Boolean) as Array<{
        href: string;
        label: string;
        icon: typeof Globe;
    }>;

    return (
        <div className="min-h-full bg-cream text-dark">
            <section className="section-padding pt-28 pb-16">
                <div className="mx-auto max-w-6xl">
                    <Link
                        href="/communities"
                        className="interactive-link mb-6 inline-flex items-center gap-2 text-sm font-inter text-dark-muted hover:text-terracotta"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Back to Communities
                    </Link>

                    <div className="overflow-hidden rounded-[2rem] border border-clay/20 bg-white shadow-soft">
                        <div
                            className="relative min-h-[280px] border-b border-clay/20 bg-dark bg-cover bg-center px-6 py-12 text-white sm:px-10"
                            style={
                                community.coverImage
                                    ? {
                                          backgroundImage: `linear-gradient(rgba(24,18,13,0.58), rgba(24,18,13,0.78)), url(${community.coverImage})`,
                                      }
                                    : {
                                          backgroundImage:
                                              "linear-gradient(135deg, rgba(196,111,74,0.95), rgba(46,32,23,0.92))",
                                      }
                            }
                        >
                            <p className="mb-3 text-xs font-inter font-bold uppercase tracking-[0.28em] text-white/80">
                                Community Page
                            </p>
                            <h1 className="max-w-3xl font-playfair text-4xl font-bold sm:text-6xl">
                                {community.title}
                            </h1>
                            <p className="mt-4 max-w-2xl text-base font-inter text-white/85 sm:text-lg">
                                {community.summary}
                            </p>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <Link
                                    href={`/communities/${community.slug}/join`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn-primary !bg-white !text-dark hover:!bg-cream-100"
                                >
                                    <Users className="h-4 w-4" />
                                    Join Community
                                </Link>
                                {community.whatsappUrl && (
                                    <a
                                        href={community.whatsappUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="btn-secondary !border-white/25 !bg-white/10 !text-white hover:!bg-white/15"
                                    >
                                        <MessageCircle className="h-4 w-4" />
                                        Chat on WhatsApp
                                    </a>
                                )}
                            </div>
                        </div>

                        <div className="grid gap-8 px-6 py-8 sm:px-10 lg:grid-cols-[1.55fr_0.9fr]">
                            <div className="space-y-8">
                                <section>
                                    <h2 className="font-playfair text-3xl font-bold text-dark">
                                        About This Community
                                    </h2>
                                    <p className="mt-4 whitespace-pre-wrap text-base font-inter leading-7 text-dark-secondary">
                                        {community.description}
                                    </p>
                                </section>

                                <section>
                                    <h2 className="font-playfair text-3xl font-bold text-dark">
                                        Quick Details
                                    </h2>
                                    <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
                                        <div className="rounded-2xl border border-clay/20 bg-cream-50 p-5">
                                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Category
                                            </p>
                                            <p className="mt-2 font-playfair text-xl font-bold text-dark sm:text-2xl">
                                                {community.category}
                                            </p>
                                        </div>
                                        <div className="rounded-2xl border border-clay/20 bg-cream-50 p-5">
                                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                City
                                            </p>
                                            <p className="mt-2 font-playfair text-xl font-bold text-dark sm:text-2xl">
                                                {community.city}
                                            </p>
                                        </div>
                                        <div className="col-span-2 rounded-2xl border border-clay/20 bg-cream-50 p-5 sm:col-span-1">
                                            <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                                Format
                                            </p>
                                            <p className="mt-2 font-playfair text-xl font-bold text-dark sm:text-2xl">
                                                {community.meetingFormat}
                                            </p>
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <aside className="space-y-6">
                                <div className="rounded-2xl border border-clay/20 bg-cream-50 p-6">
                                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                        Hosted By
                                    </p>
                                    <h2 className="mt-2 font-playfair text-3xl font-bold text-dark">
                                        {community.hostName}
                                    </h2>
                                    <div className="mt-5 space-y-3 text-sm font-inter text-dark-secondary">
                                        <a
                                            href={`mailto:${community.hostEmail}`}
                                            className="flex items-center gap-2 hover:text-terracotta"
                                        >
                                            <Mail className="h-4 w-4 text-terracotta" />
                                            {community.hostEmail}
                                        </a>
                                        <p className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-terracotta" />
                                            {community.hostPhone}
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-terracotta" />
                                            {community.city}
                                        </p>
                                        <p className="flex items-center gap-2">
                                            <Users className="h-4 w-4 text-terracotta" />
                                            {community.meetupFrequency}
                                        </p>
                                    </div>
                                </div>

                                {socialLinks.length > 0 && (
                                    <div className="rounded-2xl border border-clay/20 bg-white p-6">
                                        <p className="text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                            Connect
                                        </p>
                                        <div className="mt-4 flex flex-wrap gap-3">
                                            {socialLinks.map((link) => {
                                                const Icon = link.icon;
                                                return (
                                                    <a
                                                        key={link.label}
                                                        href={link.href}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="inline-flex items-center gap-2 rounded-full border border-clay/30 bg-cream-50 px-4 py-2 text-sm font-inter font-semibold text-dark hover:border-terracotta hover:text-terracotta"
                                                    >
                                                        <Icon className="h-4 w-4" />
                                                        {link.label}
                                                    </a>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}
                            </aside>
                        </div>
                    </div>
                </div>
            </section>

            {/* Similar Communities */}
            {similarCommunities.length > 0 && (
                <section className="section-padding pb-16">
                    <div className="mx-auto max-w-6xl">
                        <div className="mb-5 flex items-end justify-between">
                            <div>
                                <p className="mb-2 inline-flex items-center gap-2 rounded-full border border-terracotta/20 bg-terracotta/5 px-3 py-1 text-[10px] font-inter font-bold uppercase tracking-[0.26em] text-terracotta">
                                    <Sparkles className="h-3 w-3" />
                                    Similar Communities
                                </p>
                                <h2 className="font-playfair text-2xl font-bold text-dark sm:text-3xl">
                                    More communities you might like
                                </h2>
                            </div>
                            <Link
                                href="/communities"
                                className="hidden items-center gap-1.5 text-sm font-inter font-semibold text-terracotta hover:underline sm:inline-flex"
                            >
                                View All
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>

                        {/* Mobile: List cards */}
                        <div className="flex flex-col gap-3 md:hidden">
                            {similarCommunities.map((c) => (
                                <CommunityListCard key={c.slug} community={c} />
                            ))}
                        </div>

                        {/* Desktop: Grid cards */}
                        <div className="hidden gap-5 md:grid md:grid-cols-2 xl:grid-cols-3">
                            {similarCommunities.map((c) => (
                                <CommunitySpotlightCard key={c.slug} community={c} />
                            ))}
                        </div>

                        <div className="mt-5 flex justify-center md:hidden">
                            <Link href="/communities" className="btn-primary !px-5 !py-2.5 text-sm">
                                Explore All Communities
                                <ArrowRight className="h-4 w-4" />
                            </Link>
                        </div>
                    </div>
                </section>
            )}

            <Footer />
        </div>
    );
}
