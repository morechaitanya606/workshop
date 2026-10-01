"use client";

import { useEffect, useRef, type RefObject } from "react";

type UseModalA11yOptions = {
    /** Whether the modal is currently shown. Every behaviour below is active only while true. */
    open: boolean;
    /** The element that holds the modal's content; Tab focus is kept inside it. */
    containerRef: RefObject<HTMLElement | null>;
    /** Called on Escape. May change identity every render; the latest one is always used. */
    onClose: () => void;
    /** Element to focus on open. Defaults to the first focusable element, then the container. */
    initialFocusRef?: RefObject<HTMLElement | null>;
};

const FOCUSABLE_SELECTOR = [
    "a[href]",
    "area[href]",
    "button:not([disabled])",
    "input:not([disabled]):not([type='hidden'])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "iframe",
    "audio[controls]",
    "video[controls]",
    "[contenteditable]:not([contenteditable='false'])",
    "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * Open modals, innermost last. Escape and Tab belong to the top one only, so a dialog opened
 * from the mobile menu closes on its own instead of taking the menu with it.
 */
const modalStack: symbol[] = [];

/** Shared across modals so a nested one closing does not unlock the page under the outer one. */
let scrollLockCount = 0;
let overflowBeforeLock = "";

function lockScroll() {
    if (scrollLockCount === 0) {
        overflowBeforeLock = document.body.style.overflow;
        document.body.style.overflow = "hidden";
    }
    scrollLockCount += 1;
}

function unlockScroll() {
    scrollLockCount = Math.max(0, scrollLockCount - 1);
    if (scrollLockCount === 0) {
        document.body.style.overflow = overflowBeforeLock;
    }
}

// No layout-based visibility check (offsetParent, getClientRects): it would hide everything
// under jsdom, and the attributes below cover how this codebase hides controls.
function getFocusable(container: HTMLElement): HTMLElement[] {
    return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) => !element.closest("[hidden], [inert], [aria-hidden='true']")
    );
}

function focusWithoutScroll(element: HTMLElement) {
    element.focus({ preventScroll: true });
}

/**
 * Dialog behaviour for hand-rolled modals: initial focus, a Tab focus trap, Escape to close,
 * body scroll lock, and focus restored to whatever was focused before the modal opened.
 *
 * The container must be in the DOM by the time this hook's effect runs, i.e. rendered in the
 * same commit that flips `open` to true.
 */
export function useModalA11y({
    open,
    containerRef,
    onClose,
    initialFocusRef,
}: UseModalA11yOptions) {
    const onCloseRef = useRef(onClose);

    // Declared before the main effect so a new onClose is in place before any key is handled.
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!open) return;

        const token = Symbol("modal");
        const previouslyFocused =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        modalStack.push(token);
        lockScroll();

        const container = containerRef.current;
        if (container) {
            const initial = initialFocusRef?.current;
            if (initial && container.contains(initial)) {
                focusWithoutScroll(initial);
            } else if (!container.contains(document.activeElement)) {
                // Keep focus that is already inside (an autoFocus field); otherwise move it in.
                focusWithoutScroll(getFocusable(container)[0] ?? container);
            }
        }

        const handleKeyDown = (event: KeyboardEvent) => {
            if (modalStack[modalStack.length - 1] !== token) return;

            if (event.key === "Escape") {
                event.preventDefault();
                onCloseRef.current();
                return;
            }

            if (event.key !== "Tab") return;

            const current = containerRef.current;
            if (!current) return;

            const focusable = getFocusable(current);
            if (focusable.length === 0) {
                event.preventDefault();
                focusWithoutScroll(current);
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;
            const outside = !current.contains(active);

            if (event.shiftKey && (outside || active === first || active === current)) {
                event.preventDefault();
                focusWithoutScroll(last);
            } else if (!event.shiftKey && (outside || active === last)) {
                event.preventDefault();
                focusWithoutScroll(first);
            }
        };

        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("keydown", handleKeyDown);

            const index = modalStack.lastIndexOf(token);
            if (index !== -1) modalStack.splice(index, 1);
            unlockScroll();

            // The opener can be gone by now (a menu item that navigated away); focusing a
            // detached node would silently drop focus to <body> anyway.
            if (previouslyFocused?.isConnected) {
                focusWithoutScroll(previouslyFocused);
            }
        };
    }, [open, containerRef, initialFocusRef]);
}
