const COMMUNITY_SETUP_INCOMPLETE_PREFIX = "Communities setup is incomplete for this environment.";

const missingTablePatterns = [
    /Could not find the table 'public\.communities' in the schema cache/i,
    /Could not find the table 'public\.community_join_requests' in the schema cache/i,
    /relation ["']?public\.communities["']? does not exist/i,
    /relation ["']?public\.community_join_requests["']? does not exist/i,
];

function getErrorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === "object" && error && "message" in error) {
        const message = (error as { message?: unknown }).message;
        if (typeof message === "string") {
            return message;
        }
    }

    return "";
}

export function isMissingCommunitiesSchemaError(error: unknown) {
    const message = getErrorMessage(error);
    return missingTablePatterns.some((pattern) => pattern.test(message));
}

export function getCommunitiesSetupIncompleteMessage() {
    return `${COMMUNITY_SETUP_INCOMPLETE_PREFIX} Apply app/supabase/migrations/20260325_community_pages.sql to the connected Supabase database, then retry.`;
}

export function isCommunitiesSetupIncompleteMessage(message: string) {
    return message.startsWith(COMMUNITY_SETUP_INCOMPLETE_PREFIX);
}
