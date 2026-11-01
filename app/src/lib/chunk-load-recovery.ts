/**
 * Inline script for the root layout: reloads the page when a script chunk fails to load (most
 * often a tab left open across a deploy, whose old chunks are gone), so the visitor gets the new
 * build instead of a page that stopped working.
 *
 * On a flaky connection a reload is no cure, so:
 * - offline, it waits for the browser's `online` event and reloads then, instead of reloading
 *   into the browser's own offline page;
 * - it reloads at most twice in five minutes, and never twice within ten seconds, per tab
 *   session (counted in sessionStorage). Where sessionStorage cannot be written the cap cannot
 *   be kept, so it does not reload at all rather than risk a reload loop.
 */
export const CHUNK_RELOAD_STORAGE_KEY = "onlyworkshops:chunk-recovery";
export const CHUNK_RELOAD_LIMIT = 2;
export const CHUNK_RELOAD_WINDOW_MS = 5 * 60 * 1000;
export const CHUNK_RELOAD_MIN_INTERVAL_MS = 10_000;

/** Lowercase fragments of the message of a script that failed to download, in any bundler or browser. */
export const CHUNK_ERROR_MESSAGE_PARTS = [
    "chunkloaderror",
    "loading chunk",
    "failed to load chunk",
    "failed to fetch dynamically imported module",
    "error loading dynamically imported module",
    "importing a module script failed",
    "/_next/static/chunks/",
] as const;

export const chunkLoadRecoveryScript = `
(() => {
  const storageKey = ${JSON.stringify(CHUNK_RELOAD_STORAGE_KEY)};
  const reloadLimit = ${CHUNK_RELOAD_LIMIT};
  const reloadWindowMs = ${CHUNK_RELOAD_WINDOW_MS};
  const minIntervalMs = ${CHUNK_RELOAD_MIN_INTERVAL_MS};
  const chunkErrorParts = ${JSON.stringify(CHUNK_ERROR_MESSAGE_PARTS)};
  let isWaitingForOnline = false;

  function messageFrom(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (value.message) return String(value.message);
    if (value.reason) return messageFrom(value.reason);
    if (value.error) return messageFrom(value.error);
    return String(value);
  }

  function isChunkLoadError(value) {
    const name = value && value.name ? String(value.name) : "";
    const text = (name + " " + messageFrom(value)).toLowerCase();
    return chunkErrorParts.some((part) => text.includes(part));
  }

  // Reload times in this tab session, oldest first. An older build stored one
  // "path|search|time" marker; its time still counts.
  function readReloadTimes() {
    const stored = sessionStorage.getItem(storageKey) || "";
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.filter((time) => typeof time === "number");
      }
    } catch {}
    const legacyTime = Number(stored.split("|").pop() || 0);
    return legacyTime ? [legacyTime] : [];
  }

  function reloadIfAllowed() {
    const now = Date.now();
    try {
      const recent = readReloadTimes().filter(
        (time) => time <= now && now - time < reloadWindowMs
      );
      if (recent.length >= reloadLimit) return;
      if (recent.length && now - recent[recent.length - 1] < minIntervalMs) return;
      recent.push(now);
      sessionStorage.setItem(storageKey, JSON.stringify(recent));
    } catch {
      return;
    }

    location.reload();
  }

  function reloadWhenOnline() {
    if (isWaitingForOnline) return;
    isWaitingForOnline = true;
    window.addEventListener(
      "online",
      () => {
        isWaitingForOnline = false;
        reloadIfAllowed();
      },
      { once: true }
    );
  }

  function recover(value) {
    if (!isChunkLoadError(value)) return;
    if (navigator.onLine === false) {
      reloadWhenOnline();
      return;
    }
    reloadIfAllowed();
  }

  window.addEventListener("error", (event) => recover(event.error || event.message));
  window.addEventListener("unhandledrejection", (event) => recover(event.reason));
})();
`;

function messageFrom(value: unknown): string {
    if (!value) return "";
    if (typeof value === "string") return value;

    const { message, reason, error } = value as {
        message?: unknown;
        reason?: unknown;
        error?: unknown;
    };
    if (message) return String(message);
    if (reason) return messageFrom(reason);
    if (error) return messageFrom(error);
    return String(value);
}

/** The same test the inline script above applies, for code that catches the error itself. */
export function isChunkLoadError(value: unknown) {
    const name =
        value && typeof value === "object" && "name" in value
            ? String((value as { name?: unknown }).name)
            : "";
    const text = `${name} ${messageFrom(value)}`.toLowerCase();
    return CHUNK_ERROR_MESSAGE_PARTS.some((part) => text.includes(part));
}

/** `window.location.reload` as an object method, so a test can observe the call. */
export const pageActions = {
    reload: () => window.location.reload(),
};

let isWaitingToReload = false;

/**
 * The "Try again" button of an error boundary. Re-rendering retries most errors, but a lazily
 * loaded component whose script failed to download stays failed (React keeps the rejected
 * import), so only a reload can bring it back: now, or once the browser is back online. A person
 * pressing a button cannot start a reload loop, unlike the inline script above.
 */
export function retryAfterError(error: unknown, reset: () => void) {
    if (!isChunkLoadError(error)) {
        reset();
        return;
    }

    if (navigator.onLine !== false) {
        pageActions.reload();
        return;
    }

    if (isWaitingToReload) return;
    isWaitingToReload = true;
    window.addEventListener(
        "online",
        () => {
            isWaitingToReload = false;
            pageActions.reload();
        },
        { once: true }
    );
}
