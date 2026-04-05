"use client";

import { useCallback, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

interface SocialShareButtonsProps {
    title: string;
    date: string;
    city: string;
    seatsRemaining: number;
    url: string;
}

const INSTAGRAM_DM_FALLBACK_URL = "https://www.instagram.com/direct/inbox/";

function WhatsAppIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
    );
}

function InstagramIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
    );
}

function SnapchatIcon({ className }: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12.919-.24.104-.048.204-.083.3-.1a.56.56 0 01.12-.012c.181 0 .34.072.449.195.074.084.143.221.143.389 0 .265-.222.473-.413.584-.248.146-.568.282-.912.389-.078.024-.148.048-.222.075-.24.084-.48.168-.612.336-.084.12-.12.264-.12.42l.002.063c.087 1.058.483 2.028.946 2.724.301.436.655.825 1.038 1.142.236.194.476.362.707.487.096.048.204.096.3.135.12.048.18.15.18.27a.38.38 0 01-.07.227c-.116.174-.398.303-.755.403a4.72 4.72 0 01-.588.135c-.18.033-.348.06-.504.087-.264.045-.468.097-.636.158-.168.062-.354.181-.456.331-.16.24-.375.36-.675.36a.68.68 0 01-.196-.03c-.365-.105-.716-.39-1.167-.678-.648-.42-1.466-.951-2.678-1.075-.22-.024-.411-.035-.591-.035-.354 0-.652.044-.916.128a3.444 3.444 0 00-.57.225c-.408.21-.813.423-1.335.54a2.04 2.04 0 01-.447.051c-.3 0-.46-.12-.617-.354-.132-.194-.252-.39-.372-.525-.168-.188-.372-.24-.636-.287-.156-.027-.324-.054-.504-.087a4.72 4.72 0 01-.588-.135c-.357-.1-.639-.23-.755-.403a.37.37 0 01-.07-.227c0-.12.06-.222.18-.27.096-.04.204-.088.3-.136.23-.125.471-.293.707-.487.383-.317.737-.706 1.038-1.142.463-.696.86-1.666.946-2.724l.002-.063c0-.156-.036-.3-.12-.42-.132-.168-.372-.252-.612-.336a5.7 5.7 0 00-.222-.075 3.787 3.787 0 01-.912-.39c-.192-.11-.413-.318-.413-.583 0-.168.07-.305.143-.389a.59.59 0 01.45-.195.56.56 0 01.12.012c.095.017.195.052.299.1.26.12.619.224.919.24.199 0 .326-.045.4-.09a12.794 12.794 0 01-.032-.57c-.104-1.628-.23-3.654.299-4.847C7.86 1.069 11.216.793 12.206.793z" />
        </svg>
    );
}

type ShareResult = "shared" | "cancelled" | "failed" | "unavailable";

export default function SocialShareButtons({
    title,
    date,
    city,
    seatsRemaining,
    url,
}: SocialShareButtonsProps) {
    const toast = useToast();
    const [linkCopied, setLinkCopied] = useState(false);

    const shareMessage = [
        `Hey! Check out this workshop - ${title}`,
        `When: ${date}`,
        `Where: ${city}`,
        seatsRemaining > 0 && seatsRemaining <= 10
            ? `Only ${seatsRemaining} spot${seatsRemaining === 1 ? "" : "s"} left!`
            : "",
        url,
    ]
        .filter(Boolean)
        .join("\n");

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;

    const copyText = useCallback(async (text: string) => {
        if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
            return false;
        }

        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            return false;
        }
    }, []);

    const openPopup = useCallback((targetUrl: string) => {
        if (typeof window === "undefined") return;
        window.open(targetUrl, "_blank", "noopener,noreferrer");
    }, []);

    const shareNatively = useCallback(async (): Promise<ShareResult> => {
        if (typeof navigator === "undefined" || !navigator.share) {
            return "unavailable";
        }

        try {
            await navigator.share({
                title,
                text: shareMessage,
                url,
            });
            return "shared";
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                return "cancelled";
            }
            return "failed";
        }
    }, [shareMessage, title, url]);

    const handleCopyLink = useCallback(async () => {
        const copied = await copyText(url);
        if (!copied) return;

        setLinkCopied(true);
        window.setTimeout(() => setLinkCopied(false), 2000);
    }, [copyText, url]);

    const handleInstagramShare = useCallback(async () => {
        const shareResult = await shareNatively();
        if (shareResult === "shared" || shareResult === "cancelled") {
            return;
        }

        const copied = await copyText(shareMessage);
        if (copied) {
            toast.info(
                "Instagram share ready",
                "We copied a DM-ready message. Paste it into Instagram and send it."
            );
        } else {
            toast.info(
                "Open Instagram",
                "Instagram does not support direct web DM links here. Open Instagram and paste the workshop link manually."
            );
        }

        openPopup(INSTAGRAM_DM_FALLBACK_URL);
    }, [copyText, openPopup, shareMessage, shareNatively, toast]);

    const handleSnapchatShare = useCallback(() => {
        const snapUrl = `https://www.snapchat.com/scan?attachmentUrl=${encodeURIComponent(url)}`;
        openPopup(snapUrl);
    }, [openPopup, url]);

    const buttons = [
        {
            label: "WhatsApp",
            icon: WhatsAppIcon,
            onClick: () => openPopup(whatsappUrl),
            bgClass: "bg-[#25D366]/10 hover:bg-[#25D366]/20 text-[#25D366]",
        },
        {
            label: "Instagram",
            icon: InstagramIcon,
            onClick: handleInstagramShare,
            bgClass:
                "bg-gradient-to-br from-orange-500/10 to-pink-500/10 hover:from-orange-500/20 hover:to-pink-500/20 text-pink-600",
        },
        {
            label: "Snapchat",
            icon: SnapchatIcon,
            onClick: handleSnapchatShare,
            bgClass: "bg-[#FFFC00]/10 hover:bg-[#FFFC00]/20 text-[#FFD700]",
        },
        {
            label: linkCopied ? "Copied!" : "Copy Link",
            icon: linkCopied ? Check : Link2,
            onClick: handleCopyLink,
            bgClass: linkCopied
                ? "bg-emerald-100 text-emerald-600"
                : "bg-gray-100 hover:bg-gray-200 text-dark-muted",
        },
    ];

    return (
        <div className="flex items-center gap-2 flex-wrap">
            {buttons.map((btn) => (
                <button
                    key={btn.label}
                    type="button"
                    onClick={btn.onClick}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-inter font-semibold transition-all duration-200 ${btn.bgClass}`}
                    aria-label={`Share on ${btn.label}`}
                >
                    <btn.icon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{btn.label}</span>
                </button>
            ))}
        </div>
    );
}
