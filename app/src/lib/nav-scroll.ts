/**
 * Hide-on-scroll for the fixed navbar: it gets out of the way while the visitor reads down the
 * page (it was covering the hero video) and comes back the moment they scroll up.
 */

/** Above this scroll depth the bar always shows. */
export const NAV_REVEAL_ZONE_PX = 80;
/** Scroll movement smaller than this is jitter and never flips the bar. */
export const NAV_SCROLL_DELTA_PX = 8;

export type NavScrollState = {
    hidden: boolean;
    /** Scroll position the last direction change was measured from. */
    lastY: number;
};

export function nextNavScrollState(state: NavScrollState, scrollY: number): NavScrollState {
    const y = Math.max(0, scrollY);

    if (y < NAV_REVEAL_ZONE_PX) {
        return { hidden: false, lastY: y };
    }

    const delta = y - state.lastY;
    if (Math.abs(delta) < NAV_SCROLL_DELTA_PX) {
        return state;
    }

    return { hidden: delta > 0, lastY: y };
}
