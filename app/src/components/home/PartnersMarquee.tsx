"use client";

import Image from "next/image";

const CAFE_PARTNERS = [
    { name: "Blue Tokai", img: "/images/partners/blue-tokai-logo.png" },
    { name: "Boka Book Cafe", img: "/images/partners/boka-book-cafe.jpg" },
    { name: "Cafe Peter Kothrud", img: "/images/partners/cafe-peter-kothrud.jpg" },
    { name: "Cafe Peter", img: "/images/partners/cafe-peter.jpg" },
    { name: "Cafe Raaha", img: "/images/partners/cafe-raaha-logo.png" },
    { name: "Doolally", img: "/images/partners/doolally.png" },
    { name: "Hippie @ Heart", img: "/images/partners/hippie-at-heart.jpg" },
    { name: "Iyagi studio", img: "/images/partners/iyagi-studio.jpg" },
    { name: "La Ven", img: "/images/partners/la-ven-logo.jpg" },
    { name: "Starbucks", img: "/images/partners/starbucks-logo.jpg" },
    { name: "Third Place Cafe", img: "/images/partners/third-place-cafe.jpg" },
    { name: "Third Space Cafe", img: "/images/partners/third-space-cafe.jpg" },
    { name: "Third Wave Coffee", img: "/images/partners/third-wave-coffee.png" },
    { name: "Tipplr Cafe & Bar", img: "/images/partners/tipplr-cafe-bar.jpeg" },
];

export default function PartnersMarquee({ shouldReduceMotion }: { shouldReduceMotion: boolean }) {
    const marqueePartners = shouldReduceMotion
        ? CAFE_PARTNERS
        : [...CAFE_PARTNERS, ...CAFE_PARTNERS];

    return (
        <section className="section-padding overflow-hidden mt-20 sm:mt-16 mb-4">
            <div className="max-w-7xl mx-auto mb-10 text-center px-4">
                <h2 className="font-playfair text-3xl font-bold text-dark mb-4">
                    Our Cafe Partners
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
                            key={index}
                            className="flex flex-col items-center justify-center gap-3 bg-white px-6 py-5 rounded-2xl shadow-sm border border-clay/30 min-w-[220px] text-center motion-safe:hover:scale-[1.03] hover:shadow-hover transition-all duration-300"
                        >
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-cream border border-clay/50">
                                <Image
                                    src={partner.img}
                                    alt={partner.name}
                                    width={48}
                                    height={48}
                                    className="w-full h-full object-cover"
                                    sizes="48px"
                                    quality={70}
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
