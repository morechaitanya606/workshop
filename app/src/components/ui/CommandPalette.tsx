"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Command, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useModalA11y } from "@/lib/use-modal-a11y";

type PaletteItem = { label: string; href: string; requiresAuth?: boolean };

const PAGES: PaletteItem[] = [
    { label: "Home", href: "/" },
    { label: "Explore Workshops", href: "/explore" },
    { label: "About", href: "/about" },
    { label: "Contact", href: "/contact" },
    { label: "Blog", href: "/blog" },
    { label: "Communities", href: "/communities" },
    { label: "Careers", href: "/careers" },
    { label: "Help Center", href: "/help" },
    { label: "Profile", href: "/profile", requiresAuth: true },
    { label: "Host a Workshop", href: "/host", requiresAuth: true },
];

export default function CommandPalette() {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const inputRef = useRef<HTMLInputElement>(null);
    const dialogRef = useRef<HTMLDivElement>(null);
    const openRef = useRef(false);
    const router = useRouter();
    const { user } = useAuth();

    const closePalette = useCallback(() => setOpen(false), []);

    useEffect(() => {
        openRef.current = open;
    }, [open]);

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
                if (openRef.current) {
                    setOpen(false);
                    return;
                }
                // Only swallow the shortcut when it actually opens the palette, so Ctrl+K keeps
                // its normal meaning (browser search bar, editors, ...) whenever we do nothing.
                e.preventDefault();
                setOpen(true);
            }
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
    }, []);

    // Focus trap, Escape, scroll lock and focus restore; the search box takes initial focus
    // synchronously, so no setTimeout is needed (and none can fire after unmount).
    useModalA11y({
        open,
        containerRef: dialogRef,
        onClose: closePalette,
        initialFocusRef: inputRef,
    });

    useEffect(() => {
        if (open) {
            setQuery("");
        }
    }, [open]);

    const filtered = useMemo(() => {
        const available = PAGES.filter((page) => !page.requiresAuth || user);
        if (!query.trim()) return available;
        const q = query.toLowerCase();
        return available.filter(
            (page) => page.label.toLowerCase().includes(q) || page.href.toLowerCase().includes(q)
        );
    }, [query, user]);

    const handleSelect = (href: string) => {
        setOpen(false);
        router.push(href);
    };

    return (
        <AnimatePresence>
            {open && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 z-[90] bg-black/40 backdrop-blur-sm"
                        onClick={() => setOpen(false)}
                    />
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: -20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -20 }}
                        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                        ref={dialogRef}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Command palette"
                        tabIndex={-1}
                        className="fixed top-[20%] left-1/2 -translate-x-1/2 z-[95] w-[90vw] max-w-lg outline-none"
                    >
                        <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                                <Search className="w-5 h-5 text-dark-muted flex-shrink-0" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search pages..."
                                    aria-label="Search pages"
                                    className="flex-1 bg-transparent outline-none text-sm font-inter text-dark placeholder:text-dark-muted"
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && filtered.length > 0) {
                                            handleSelect(filtered[0].href);
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setOpen(false)}
                                    className="text-dark-muted hover:text-dark transition-colors"
                                    aria-label="Close command palette"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="max-h-64 overflow-y-auto py-2">
                                {filtered.length === 0 && (
                                    <p className="px-4 py-6 text-sm font-inter text-dark-muted text-center">
                                        No results found
                                    </p>
                                )}
                                {filtered.map((page) => (
                                    <button
                                        key={page.href}
                                        type="button"
                                        onClick={() => handleSelect(page.href)}
                                        className="w-full text-left px-4 py-2.5 text-sm font-inter font-medium text-dark hover:bg-cream-50 hover:text-terracotta transition-colors flex items-center gap-3"
                                    >
                                        <Command className="w-3.5 h-3.5 text-dark-muted" />
                                        {page.label}
                                        <span className="ml-auto text-xs text-dark-muted">
                                            {page.href}
                                        </span>
                                    </button>
                                ))}
                            </div>
                            <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-[11px] font-inter text-dark-muted">
                                <span>
                                    <kbd className="px-1.5 py-0.5 rounded bg-cream-100 border border-gray-200 font-mono text-[10px]">
                                        ↵
                                    </kbd>{" "}
                                    to select
                                </span>
                                <span>
                                    <kbd className="px-1.5 py-0.5 rounded bg-cream-100 border border-gray-200 font-mono text-[10px]">
                                        esc
                                    </kbd>{" "}
                                    to close
                                </span>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
