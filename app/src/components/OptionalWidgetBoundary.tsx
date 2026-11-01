"use client";

import { Component, type ReactNode } from "react";
import { isChunkLoadError } from "@/lib/chunk-load-recovery";
import { reportError } from "@/lib/sentry-client";

/**
 * Around an optional, lazily loaded widget (chat launcher, back-to-top, cookie banner...). The
 * widgets download after the page has loaded, so on a flaky connection, or in a tab left open
 * across a deploy, the download can fail, and next/dynamic then throws while rendering. The
 * widgets sit in layouts, above the route's error.tsx, so without this the whole page would be
 * replaced by an error screen over a floating button. A widget that fails just does not appear.
 */
export default class OptionalWidgetBoundary extends Component<
    { name: string; children: ReactNode },
    { hasFailed: boolean }
> {
    state = { hasFailed: false };

    static getDerivedStateFromError() {
        return { hasFailed: true };
    }

    componentDidCatch(error: unknown) {
        // A failed download is the connection's doing, not a bug worth tracking.
        if (!isChunkLoadError(error)) {
            reportError(error, {
                route: "optional_widget",
                widget: this.props.name,
                layer: "web",
            });
        }
    }

    render() {
        return this.state.hasFailed ? null : this.props.children;
    }
}
