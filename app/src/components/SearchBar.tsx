"use client";

import { motion } from "framer-motion";
import { Search, Calendar, MapPin, ArrowRight } from "lucide-react";

export default function SearchBar() {
    return (
        <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-4xl mx-auto"
        >
            <div className="bg-white rounded-2xl shadow-card p-2 sm:p-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr,1fr,1fr,auto] gap-2 sm:gap-0">
                    {/* What */}
                    <div className="flex items-center gap-3 px-4 py-3 sm:border-r border-gray-100">
                        <Search className="w-5 h-5 text-dark-muted flex-shrink-0" />
                        <div className="flex-1">
                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-0.5">
                                What
                            </label>
                            <input
                                type="text"
                                placeholder="Pottery, Jazz, Hiking..."
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60"
                            />
                        </div>
                    </div>

                    {/* When */}
                    <div className="flex items-center gap-3 px-4 py-3 sm:border-r border-gray-100">
                        <Calendar className="w-5 h-5 text-dark-muted flex-shrink-0" />
                        <div className="flex-1">
                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-0.5">
                                When
                            </label>
                            <input
                                type="text"
                                placeholder="Pick a date"
                                className="w-full bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted/60"
                            />
                        </div>
                    </div>

                    {/* Where */}
                    <div className="flex items-center gap-3 px-4 py-3">
                        <MapPin className="w-5 h-5 text-dark-muted flex-shrink-0" />
                        <div className="flex-1">
                            <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-0.5">
                                Where
                            </label>
                            <select className="w-full bg-transparent outline-none text-sm font-inter text-dark appearance-none cursor-pointer">
                                <option>Pune</option>
                                <option>Mumbai</option>
                                <option>Bangalore</option>
                                <option>Delhi</option>
                            </select>
                        </div>
                    </div>

                    {/* Search Button */}
                    <div className="flex items-center px-2">
                        <button className="btn-primary w-full sm:w-auto !rounded-xl !px-6">
                            <span className="hidden sm:inline">Find Fun</span>
                            <ArrowRight className="w-5 h-5" />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
