import { useEffect, useState } from "react";

/**
 * Holds back client work nobody needs for the first paint or the first taps (floating widgets,
 * error reporting) until the page has loaded and the browser is idle. On a slow phone or
 * connection that keeps it from competing with the hero image, the page's own scripts and
 * hydration.
 */

/** Longest wait for an idle moment once the page has loaded. */
const IDLE_TIMEOUT_MS = 2_000;

/** Browsers without requestIdleCallback (Safari) run the work this long after `load`. */
const NO_IDLE_CALLBACK_DELAY_MS = 300;

/** One slow resource can hold `load` back for a long time; past this, stop waiting for it. */
const LOAD_EVENT_TIMEOUT_MS = 10_000;

/**
 * Runs `callback` once, after the window `load` event and then an idle callback (or the timeout
 * fallbacks above). Returns a function that cancels it.
 */
export function runWhenPageIdle(callback: () => void): () => void {
    if (typeof window === "undefined") {
        return () => {};
    }

    let isDone = false;
    let idleHandle: number | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearPending = () => {
        window.removeEventListener("load", onLoad);
        if (idleHandle !== null && typeof window.cancelIdleCallback === "function") {
            window.cancelIdleCallback(idleHandle);
        }
        if (timer !== null) {
            clearTimeout(timer);
        }
        idleHandle = null;
        timer = null;
    };

    const run = () => {
        if (isDone) return;
        isDone = true;
        clearPending();
        callback();
    };

    function onLoad() {
        if (isDone) return;
        clearPending();
        if (typeof window.requestIdleCallback === "function") {
            idleHandle = window.requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
        } else {
            timer = setTimeout(run, NO_IDLE_CALLBACK_DELAY_MS);
        }
    }

    if (document.readyState === "complete") {
        onLoad();
    } else {
        window.addEventListener("load", onLoad, { once: true });
        timer = setTimeout(onLoad, LOAD_EVENT_TIMEOUT_MS);
    }

    return () => {
        isDone = true;
        clearPending();
    };
}

/**
 * False on the server and through hydration, then true once the page has loaded and the browser
 * is idle (see runWhenPageIdle). Anything rendered behind it is absent from the server HTML.
 */
export function usePageIdle() {
    const [isPageIdle, setIsPageIdle] = useState(false);

    useEffect(() => runWhenPageIdle(() => setIsPageIdle(true)), []);

    return isPageIdle;
}
