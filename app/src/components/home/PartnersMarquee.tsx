"use client";

import Image from "next/image";

const CAFE_PARTNERS = [
    {
        name: "The Daily Brew",
        img: "https://images.unsplash.com/photo-1554118811-1e0d58224f24?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Cafe Atelier",
        img: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Studio Beans",
        img: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Roast & Ritual",
        img: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Brew Lab",
        img: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Clay Cup Cafe",
        img: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Boka Cafe",
        img: "https://images.unsplash.com/photo-1600093463592-8e36ae95ef56?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Third Space Cafe",
        img: "https://images.unsplash.com/photo-1511920170033-f8396924c348?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Third Place Cafe",
        img: "https://images.unsplash.com/photo-1453614512568-c4024d13c247?auto=format&fit=crop&q=70&w=200&h=200",
    },
    {
        name: "Raaha Cafe",
        img: "https://images.unsplash.com/photo-1525610553991-2bede1a236e2?auto=format&fit=crop&q=70&w=200&h=200",
    },
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
