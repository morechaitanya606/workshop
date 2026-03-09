import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/core";
import { z } from "zod";

type ParseSuccess<T> = {
    ok: true;
    data: T;
};

type ParseFailure = {
    ok: false;
    response: NextResponse;
};

export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

function badRequest(message: string, details?: unknown) {
    return NextResponse.json(
        {
            error: message,
            details: details ?? null,
        },
        { status: 400 }
    );
}

function queryObjectFromParams(params: URLSearchParams) {
    const query: Record<string, string | string[]> = {};

    params.forEach((value, key) => {
        const existing = query[key];
        if (typeof existing === "string") {
            query[key] = [existing, value];
            return;
        }

        if (Array.isArray(existing)) {
            existing.push(value);
            return;
        }

        query[key] = value;
    });

    return query;
}

export function parseQuery<TSchema extends z.ZodTypeAny>(
    request: NextRequest,
    schema: TSchema,
    message = "Invalid query parameters."
): ParseResult<z.infer<TSchema>> {
    const parsed = schema.safeParse(queryObjectFromParams(request.nextUrl.searchParams));
    if (!parsed.success) {
        return {
            ok: false,
            response: badRequest(message, parsed.error.flatten()),
        };
    }

    return { ok: true, data: parsed.data };
}

export async function parseBody<TSchema extends z.ZodTypeAny>(
    request: NextRequest,
    schema: TSchema,
    invalidJsonMessage = "Invalid JSON payload.",
    validationMessage = "Request validation failed."
): Promise<ParseResult<z.infer<TSchema>>> {
    let body: unknown;
    try {
        body = await request.json();
    } catch {
        return {
            ok: false,
            response: badRequest(invalidJsonMessage),
        };
    }

    const parsed = schema.safeParse(body);
    if (!parsed.success) {
        return {
            ok: false,
            response: badRequest(validationMessage, parsed.error.flatten()),
        };
    }

    return { ok: true, data: parsed.data };
}

function formatErrorDetails(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

export function handleApiError(message: string, error: unknown, status = 500) {
    Sentry.captureException(error, {
        tags: {
            layer: "api",
        },
        extra: {
            message,
            status,
        },
    });

    return NextResponse.json(
        {
            error: message,
            details: formatErrorDetails(error),
        },
        { status }
    );
}
