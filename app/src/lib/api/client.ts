import type { Workshop } from "@/lib/data";
import { isCommunitiesSetupIncompleteMessage } from "@/lib/community-api-errors";

type Primitive = string | number | boolean | null | undefined;

export class ApiClientError extends Error {
    status: number;
    details: unknown;

    constructor(message: string, status: number, details?: unknown) {
        super(message);
        this.name = "ApiClientError";
        this.status = status;
        this.details = details ?? null;
    }
}

type ApiRequestOptions = {
    method?: "GET" | "POST" | "PATCH" | "DELETE";
    accessToken?: string;
    body?: unknown;
    cache?: RequestCache;
};

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}) {
    const headers: Record<string, string> = {};
    if (options.body !== undefined) {
        headers["Content-Type"] = "application/json";
    }
    if (options.accessToken) {
        headers.Authorization = `Bearer ${options.accessToken}`;
    }

    const response = await fetch(path, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        cache: options.cache,
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new ApiClientError(
            String(payload?.error || "Request failed."),
            response.status,
            payload?.details ?? payload
        );
    }

    return payload as T;
}

export function isApiClientError(error: unknown): error is ApiClientError {
    return error instanceof ApiClientError;
}

export function toApiErrorMessage(error: unknown, fallbackMessage: string) {
    if (isApiClientError(error)) {
        if (isCommunitiesSetupIncompleteMessage(error.message)) {
            return error.message;
        }
        if (error.status >= 500) {
            return fallbackMessage;
        }
        return error.message || fallbackMessage;
    }
    return fallbackMessage;
}

export type { Primitive, ApiRequestOptions };
