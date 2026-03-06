"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { Calendar, MapPin, Star, Heart, Clock } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Workshop } from "@/lib/data";

interface WorkshopCardProps {
    workshop: Workshop;
    index?: number;
    variant?: "default" | "compact";
}

export default function WorkshopCard({
    workshop,
    index = 0,
    variant = "default",
}: WorkshopCardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{
                duration: 0.6,
                delay: index * 0.1,
                ease: [0.22, 1, 0.36, 1],
            }}
        >
            <Link href={`/workshop/${workshop.id}`} className="block group">
                <div className="card-workshop">
                    {/* Image */}
                    <div className="relative overflow-hidden aspect-[4/3]">
                        <Image
                            src={workshop.coverImage}
                            alt={workshop.title}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                            className="object-cover transition-transform duration-700 ease-out group-hover:scale-110"
                            loading="lazy"
                        />
                        {/* Category Badge */}
                        <div className="absolute top-3 left-3">
                            <span className="inline-block bg-terracotta text-white text-[10px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                {workshop.category}
                            </span>
                        </div>
                        {/* Bestseller / New Badge */}
                        {workshop.isBestseller && (
                            <div className="absolute top-3 right-3">
                                <span className="inline-block bg-dark text-white text-[10px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                    Bestseller
                                </span>
                            </div>
                        )}
                        {workshop.isNew && (
                            <div className="absolute top-3 right-3">
                                <span className="inline-block bg-emerald-500 text-white text-[10px] font-inter font-bold uppercase tracking-wider px-2.5 py-1 rounded-md">
                                    New
                                </span>
                            </div>
                        )}
                        {/* Save Heart */}
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                            }}
                            className="absolute bottom-3 right-3 p-2 bg-white/90 backdrop-blur-sm rounded-full shadow-soft opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-white hover:scale-110"
                        >
                            <Heart className="w-4 h-4 text-dark-muted" />
                        </button>
                        {/* Gradient overlay */}
                        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                    </div>

                    {/* Content */}
                    <div className="p-4">
                        {/* Date & Time */}
                        <div className="flex items-center gap-1.5 mb-2">
                            <Calendar className="w-3.5 h-3.5 text-dark-muted" />
                            <span className="text-xs font-inter text-dark-muted">
                                {formatDate(workshop.date)} &bull; {workshop.time}
                            </span>
                        </div>

                        {/* Title */}
                        <h3 className="font-playfair text-base sm:text-lg font-semibold text-dark leading-snug mb-2 line-clamp-2 group-hover:text-terracotta transition-colors duration-300">
                            {workshop.title}
                        </h3>

                        {/* Location */}
                        {variant === "default" && (
                            <div className="flex items-center gap-1.5 mb-3">
                                <MapPin className="w-3.5 h-3.5 text-dark-muted" />
                                <span className="text-xs font-inter text-dark-muted">
                                    {workshop.location}, {workshop.city}
                                </span>
                            </div>
                        )}

                        {/* Bottom Row */}
                        <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                            <div className="flex items-center gap-1.5">
                                {workshop.reviewCount > 0 ? (
                                    <>
                                        <Star className="w-3.5 h-3.5 text-terracotta fill-terracotta" />
                                        <span className="text-sm font-inter font-semibold text-dark">
                                            {workshop.rating}
                                        </span>
                                        <span className="text-xs font-inter text-dark-muted">
                                            ({workshop.reviewCount})
                                        </span>
                                    </>
                                ) : (
                                    <span className="text-xs font-inter font-semibold text-emerald-600 flex items-center gap-1">
                                        <Star className="w-3.5 h-3.5" />
                                        NEW
                                    </span>
                                )}
                            </div>
                            <span className="text-lg font-inter font-bold text-terracotta">
                                {formatCurrency(workshop.price)}
                            </span>
                        </div>

                        {/* Seats indicator */}
                        {workshop.seatsRemaining <= 5 && (
                            <div className="mt-2">
                                <div className="flex items-center gap-1.5">
                                    <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-terracotta rounded-full transition-all duration-500"
                                            style={{
                                                width: `${((workshop.maxSeats - workshop.seatsRemaining) / workshop.maxSeats) * 100}%`,
                                            }}
                                        />
                                    </div>
                                    <span className="text-[10px] font-inter font-semibold text-terracotta whitespace-nowrap">
                                        {workshop.seatsRemaining} left
                                    </span>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </Link>
        </motion.div>
    );
}
