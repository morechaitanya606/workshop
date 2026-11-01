"use client";

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from "react";
import { hasStalledTooOften, recordStall } from "@/lib/hero-video-bandwidth";

/**
 * How long to wait for a clip to actually start playing before giving up on it.
 *
 * A slow connection does not fire `error` - the request just hangs, so the poster stays up
 * while the browser keeps pulling megabytes the visitor will never see. Past this deadline
 * the element is unmounted, which aborts the download and leaves the poster as the final
 * state instead of a permanently "loading" hero.
 */
export const HERO_PLAYBACK_DEADLINE_MS = 8000;

/**
 * A looping clip pausing within this many seconds of its start is only the loop restarting: the
 * browser fetches the start of the file again, which on a slower link can take a few seconds and
 * raise `waiting` more than once.
 */
const LOOP_RESTART_SECONDS = 3;

/**
 * A tab that was hidden pauses its video; when it comes back the video catches up and raises a
 * burst of `waiting` events. Those, and the ones while it is hidden, are the browser and not the
 * visitor's connection, so they are not counted for this long after the tab is visible again.
 */
export const HERO_RESUME_GRACE_MS = 3000;

type HeroVideoPanelProps = {
    /**
     * One clip loops on its own. Several are played one after another and loop back to the first.
     * Pass a stable array (a module constant): a new one on every render restarts nothing, but
     * it is read on every `ended`.
     */
    sources: readonly string[];
    /** The clip keeps running dry: the hero drops every video and keeps the poster image. */
    onStalledOut: () => void;
    /** Positions the panel; it fills the hero when absent. */
    className?: string;
};

/**
 * One muted, looping hero video with the slow-connection protections the hero has always had:
 * it starts only once the browser has the data, a clip that cannot load is skipped, a clip that
 * never starts or keeps rebuffering is given up on, and the poster image underneath shows
 * through until (and wherever) a clip actually plays. The hero mounts it only while it is on
 * screen, so scrolling away unmounts it, which stops the download and the decoding.
 */
export default function HeroVideoPanel({
    sources,
    onStalledOut,
    className = "absolute inset-0",
}: HeroVideoPanelProps) {
    const [clipIndex, setClipIndex] = useState(0);
    // Tracked per clip so advancing to the next one re-runs the fade instead of flashing a
    // half-loaded frame.
    const [readySrc, setReadySrc] = useState<string | null>(null);
    const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(() => new Set());
    const stallTimesRef = useRef<number[]>([]);
    // When the tab last became visible again (never, until it was hidden once).
    const resumedAtRef = useRef(Number.NEGATIVE_INFINITY);

    const src = sources[clipIndex] ?? null;
    const hasMany = sources.length > 1;
    const hasCurrentFailed = Boolean(src) && failedSrcs.has(src!);
    const haveAllFailed = sources.every((source) => failedSrcs.has(source));

    const advance = useCallback(
        () => setClipIndex((index) => (index + 1) % Math.max(sources.length, 1)),
        [sources.length]
    );

    // Skip past a clip that could not load, but stop once every clip has failed so the
    // sequence cannot spin forever - the poster image is the fallback at that point.
    useEffect(() => {
        if (!hasCurrentFailed || haveAllFailed) return;
        advance();
    }, [advance, hasCurrentFailed, haveAllFailed]);

    // Treat "never started playing" the same as a load error. Without this a stalled request
    // keeps downloading a multi-megabyte clip on a connection too slow to ever show it, which is
    // the worst outcome for the visitor: no video AND wasted data.
    useEffect(() => {
        if (!src || readySrc === src || failedSrcs.has(src)) return;

        const timer = setTimeout(() => {
            setFailedSrcs((previous) => new Set(previous).add(src));
        }, HERO_PLAYBACK_DEADLINE_MS);

        return () => clearTimeout(timer);
    }, [src, readySrc, failedSrcs]);

    // Each clip starts with a clean rebuffering count.
    useEffect(() => {
        stallTimesRef.current = [];
    }, [src]);

    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === "visible") resumedAtRef.current = performance.now();
        };
        document.addEventListener("visibilitychange", onVisibilityChange);
        return () => document.removeEventListener("visibilitychange", onVisibilityChange);
    }, []);

    // A clip that started but keeps running dry is using the visitor's whole connection to show
    // a frozen frame: past a few rebuffers in a short window the hero unmounts every video (which
    // stops the downloads) and keeps the poster image.
    const registerStall = useCallback(
        (event: SyntheticEvent<HTMLVideoElement>) => {
            const video = event.currentTarget;
            // Hidden tab, or just back to the front: the video is catching up (see
            // HERO_RESUME_GRACE_MS). This is what took every video down for a visitor who
            // switched tabs and came back.
            if (
                document.visibilityState !== "visible" ||
                performance.now() - resumedAtRef.current < HERO_RESUME_GRACE_MS
            ) {
                return;
            }
            // A looping clip raises `waiting` every time it jumps back to its start: the browser
            // has dropped the start of the file from its buffer and fetches it again. That is not
            // the connection running dry, and a short clip wraps often enough (the 22 s one about
            // every 22 s) that, with one real hiccup, those alone reached the limit and took every
            // video down. Only the first seconds of a loop are exempt: a clip that then fails to
            // get going is still caught by the next stall.
            if (video.loop && video.currentTime < LOOP_RESTART_SECONDS) return;
            // `waiting` always means playback ran out of data; `stalled` only counts when it did
            // too (it can also fire while plenty is buffered and the download merely paused).
            if (event.type === "stalled" && video.readyState >= video.HAVE_FUTURE_DATA) return;

            stallTimesRef.current = recordStall(stallTimesRef.current, performance.now());
            if (hasStalledTooOften(stallTimesRef.current)) onStalledOut();
        },
        [onStalledOut]
    );

    if (!src || hasCurrentFailed) return null;

    // Autoplay can be refused (data saver, low power mode) without firing `error`, so the poster
    // stays visible underneath until the video actually plays.
    const isVisible = readySrc === src;

    return (
        <div className={`${className} overflow-hidden`}>
            {/* No `poster`: the optimised hero image underneath already shows that frame, and the
                raw poster file was a second, unoptimised download of it. */}
            <video
                key={src}
                src={src}
                autoPlay
                muted
                loop={!hasMany}
                playsInline
                // Never "auto": that races the full file down before playback starts, which is
                // exactly what stalls a hero on a slow mobile connection.
                preload="metadata"
                aria-hidden="true"
                tabIndex={-1}
                onPlaying={() => setReadySrc(src)}
                // Counted only once playing: the start-up wait is the deadline's job.
                onWaiting={isVisible ? registerStall : undefined}
                onStalled={isVisible ? registerStall : undefined}
                onEnded={hasMany ? advance : undefined}
                onError={() => setFailedSrcs((previous) => new Set(previous).add(src))}
                className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-700 ease-out ${
                    isVisible ? "opacity-100" : "opacity-0"
                }`}
            />
        </div>
    );
}
