type HuggingFaceEmbeddingConfig = {
    apiKey: string;
    endpoint: string;
    model: string;
};

type EmbedChatbotTextInput = {
    text: string;
    mode: "query" | "passage";
    config: HuggingFaceEmbeddingConfig;
    fetchImpl?: typeof fetch;
};

const EMBEDDING_TIMEOUT_MS = 12000;

function meanPoolEmbeddings(values: number[][]) {
    if (values.length === 0) {
        return [];
    }

    const dimensions = values[0]?.length ?? 0;
    if (dimensions === 0) {
        return [];
    }

    const pooled = new Array<number>(dimensions).fill(0);

    for (const row of values) {
        for (let index = 0; index < dimensions; index += 1) {
            pooled[index] += row[index] ?? 0;
        }
    }

    return pooled.map((value) => value / values.length);
}

function isNumberArray(value: unknown): value is number[] {
    return Array.isArray(value) && value.every((item) => typeof item === "number");
}

function extractEmbeddingVector(payload: unknown): number[] {
    if (isNumberArray(payload)) {
        return payload;
    }

    if (Array.isArray(payload) && payload.length > 0) {
        const [firstItem] = payload;

        if (isNumberArray(firstItem)) {
            return meanPoolEmbeddings(payload as number[][]);
        }

        if (Array.isArray(firstItem) && firstItem.length > 0 && isNumberArray(firstItem[0])) {
            return meanPoolEmbeddings(firstItem as number[][]);
        }
    }

    throw new Error("Unsupported embedding payload shape.");
}

function normalizeEmbedding(vector: number[]) {
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(magnitude) || magnitude === 0) {
        throw new Error("Embedding vector could not be normalized.");
    }

    return vector.map((value) => value / magnitude);
}

export function getEmbeddingInput(text: string, mode: "query" | "passage") {
    return `${mode}: ${text.trim()}`;
}

export async function embedChatbotText({
    text,
    mode,
    config,
    fetchImpl = fetch,
}: EmbedChatbotTextInput) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

    try {
        const response = await fetchImpl(config.endpoint, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                inputs: getEmbeddingInput(text, mode),
                options: {
                    wait_for_model: true,
                    use_cache: true,
                },
            }),
            cache: "no-store",
            signal: controller.signal,
        });

        if (!response.ok) {
            throw new Error(`Embedding request failed with status ${response.status}.`);
        }

        const payload = (await response.json()) as unknown;
        return normalizeEmbedding(extractEmbeddingVector(payload));
    } finally {
        clearTimeout(timeoutId);
    }
}

export async function embedChatbotQuery(
    text: string,
    config: HuggingFaceEmbeddingConfig,
    fetchImpl?: typeof fetch
) {
    return embedChatbotText({
        text,
        mode: "query",
        config,
        fetchImpl,
    });
}

export async function embedChatbotPassage(
    text: string,
    config: HuggingFaceEmbeddingConfig,
    fetchImpl?: typeof fetch
) {
    return embedChatbotText({
        text,
        mode: "passage",
        config,
        fetchImpl,
    });
}
