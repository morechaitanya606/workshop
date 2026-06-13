"use client";

import Image from "next/image";
import type { CafePartner } from "@/lib/api-client";

const DEFAULT_CAFE_PARTNERS: CafePartner[] = [
    { id: "blue-tokai", name: "Blue Tokai", logo_url: "/images/partners/blue-tokai-logo.png" },
    {
        id: "boka-book-cafe",
        name: "Boka Book Cafe",
        logo_url: "/images/partners/boka-book-cafe.jpg",
    },
    {
        id: "butterish-kitchen",
        name: "Butterish Kitchen | Studio",
        logo_url: "/images/partners/butterish-kitchen.jpg",
    },
    { id: "cafe-peter", name: "Cafe Peter", logo_url: "/images/partners/cafe-peter.jpg" },
    { id: "cafe-raaha", name: "Cafe Raaha", logo_url: "/images/partners/cafe-raaha-logo.png" },
    { id: "doolally", name: "Doolally", logo_url: "/images/partners/doolally.png" },
    {
        id: "hippie-at-heart",
        name: "Hippie @ Heart",
        logo_url: "/images/partners/hippie-at-heart.jpg",
    },
    { id: "iyagi-studio", name: "Iyagi Studio", logo_url: "/images/partners/iyagi-studio.jpg" },
    { id: "la-ven", name: "Le Ven", logo_url: "/images/partners/la-ven-logo.jpg" },
    {
        id: "mirelle-patisserie",
        name: "Mirelle Patisserie",
        logo_url: "/images/partners/mirelle-patisserie.jpg",
    },
    { id: "starbucks", name: "Starbucks", logo_url: "/images/partners/starbucks-logo.jpg" },
    {
        id: "third-place-cafe",
        name: "Third Place Cafe",
        logo_url: "/images/partners/third-place-cafe.jpg",
    },
    {
        id: "third-space-cafe",
        name: "Third Space Cafe",
        logo_url: "/images/partners/third-space-cafe.jpg",
    },
    {
        id: "third-wave-coffee",
        name: "Third Wave Coffee",
        logo_url: "/images/partners/third-wave-coffee.png",
    },
    { id: "tipplr", name: "Tipplr Cafe & Bar", logo_url: "/images/partners/tipplr-cafe-bar.jpeg" },
];

export default function PartnersMarquee({
    shouldReduceMotion,
    partners,
}: {
    shouldReduceMotion: boolean;
    partners?: CafePartner[];
}) {
    const cafePartners = partners && partners.length > 0 ? partners : DEFAULT_CAFE_PARTNERS;
    const marqueePartners = shouldReduceMotion ? cafePartners : [...cafePartners, ...cafePartners];

    return (
        <section className="section-padding overflow-hidden mt-20 sm:mt-16 mb-4">
            <div className="max-w-7xl mx-auto mb-10 text-center px-4">
                <h2 className="font-playfair text-3xl font-bold text-dark mb-4">
                    Our Cafe/ Studio Partners
                </h2>
                <p className="text-body text-dark-muted max-w-2xl mx-auto">
                    We host our experiences at the finest cafes across the city.
                </p>
            </div>

            <div className="flex w-full relative">
                <div
                    className={`flex gap-6 items-center pr-6 ${
                        shouldReduceMotion
                            ? "w-full flex-wrap justify-center"
                            : "partners-marquee-track whitespace-nowrap min-w-max"
                    }`}
                >
                    {marqueePartners.map((partner, index) => (
                        <div
                            key={`${partner.id}-${index}`}
                            className="flex flex-col items-center justify-center gap-3 bg-white px-6 py-5 rounded-2xl shadow-sm border border-clay/30 min-w-[220px] text-center motion-safe:hover:scale-[1.03] hover:shadow-hover transition-all duration-300"
                        >
                            <div className="w-20 h-20 overflow-hidden bg-white flex items-center justify-center p-1">
                                <Image
                                    src={partner.logo_url}
                                    alt={partner.name}
                                    width={80}
                                    height={80}
                                    className="w-full h-full object-contain"
                                    sizes="80px"
                                    quality={80}
                                />
                            </div>
                            <span className="font-playfair font-bold text-lg text-dark">
                                {partner.name}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
