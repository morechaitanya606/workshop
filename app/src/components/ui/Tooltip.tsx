"use client";

import { useState, useRef, useId } from "react";

interface TooltipProps {
    content: string;
    children: React.ReactNode;
    side?: "top" | "bottom";
}

export default function Tooltip({ content, children, side = "top" }: TooltipProps) {
    const [visible, setVisible] = useState(false);
    const tooltipId = useId();
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const show = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setVisible(true), 200);
    };

    const hide = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setVisible(false);
    };

    return (
        <div
            className="relative inline-flex"
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={show}
            onBlur={hide}
        >
            <div aria-describedby={visible ? tooltipId : undefined}>{children}</div>
            {visible && (
                <div
                    id={tooltipId}
                    role="tooltip"
                    className={`absolute left-1/2 -translate-x-1/2 z-50 px-2.5 py-1.5 rounded-lg bg-dark text-white text-xs font-inter font-medium whitespace-nowrap shadow-lg animate-fade-in pointer-events-none ${
                        side === "top" ? "bottom-full mb-2" : "top-full mt-2"
                    }`}
                >
                    {content}
                    <span
                        className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-dark rotate-45 ${
                            side === "top" ? "top-full -mt-1" : "bottom-full -mb-1"
                        }`}
                    />
                </div>
            )}
        </div>
    );
}
