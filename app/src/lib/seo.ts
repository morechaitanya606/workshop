/**
 * Next replaces (does not merge) a child's `openGraph` object over the parent's, so a page that
 * sets its own `openGraph.title` silently loses the root layout's `images`. Spread this into any
 * page-level `openGraph` that does not have an image of its own.
 */
export const DEFAULT_OG_IMAGES = [
    {
        url: "/images/og-default.jpg",
        width: 1200,
        height: 630,
        alt: "Only Workshops social preview",
    },
];
