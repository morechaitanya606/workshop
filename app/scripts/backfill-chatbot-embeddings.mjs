import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(filename) {
    const filePath = path.resolve(process.cwd(), filename);
    if (!fs.existsSync(filePath)) {
        return;
    }

    const contents = fs.readFileSync(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
            continue;
        }

        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex <= 0) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        const value = rawValue.replace(/^['"]|['"]$/g, "");

        if (!(key in process.env)) {
            process.env[key] = value;
        }
    }
}

function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing environment variable: ${name}`);
    }
    return value;
}

function meanPool(values) {
    const dimensions = values[0]?.length ?? 0;
    const pooled = new Array(dimensions).fill(0);

    for (const row of values) {
        for (let index = 0; index < dimensions; index += 1) {
            pooled[index] += row[index] ?? 0;
        }
    }

    return pooled.map((value) => value / values.length);
}

function normalize(vector) {
    const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
    if (!Number.isFinite(magnitude) || magnitude === 0) {
        throw new Error("Embedding vector could not be normalized.");
    }
    return vector.map((value) => value / magnitude);
}

function extractVector(payload) {
    if (Array.isArray(payload) && payload.every((value) => typeof value === "number")) {
        return payload;
    }

    if (
        Array.isArray(payload) &&
        payload.length > 0 &&
        Array.isArray(payload[0]) &&
        payload[0].every((value) => typeof value === "number")
    ) {
        return meanPool(payload);
    }

    if (
        Array.isArray(payload) &&
        payload.length > 0 &&
        Array.isArray(payload[0]) &&
        payload[0].length > 0 &&
        Array.isArray(payload[0][0])
    ) {
        return meanPool(payload[0]);
    }

    throw new Error("Unsupported embedding payload shape.");
}

function toVectorLiteral(vector) {
    return `[${vector.join(",")}]`;
}

async function embedFaq(question, answer, endpoint, apiKey) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            inputs: `passage: Q: ${question}\nA: ${answer}`,
            options: {
                wait_for_model: true,
                use_cache: true,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Embedding request failed with status ${response.status}`);
    }

    const payload = await response.json();
    return normalize(extractVector(payload));
}

async function main() {
    loadEnvFile(".env.local");
    loadEnvFile(".env");

    const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const huggingFaceApiKey = getRequiredEnv("HUGGINGFACE_API_KEY");
    const model = process.env.HUGGINGFACE_EMBEDDING_MODEL || "intfloat/multilingual-e5-base";
    const endpoint =
        process.env.HUGGINGFACE_EMBEDDING_ENDPOINT ||
        `https://api-inference.huggingface.co/pipeline/feature-extraction/${encodeURIComponent(
            model
        )}`;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    const { data, error } = await supabase
        .from("faq")
        .select("id, question, answer")
        .is("embedding", null)
        .order("created_at", { ascending: true });

    if (error) {
        throw error;
    }

    const rows = Array.isArray(data) ? data : [];
    console.log(`Found ${rows.length} FAQ rows without embeddings.`);

    for (const row of rows) {
        console.log(`Embedding FAQ ${row.id}: ${row.question}`);
        const embedding = await embedFaq(row.question, row.answer, endpoint, huggingFaceApiKey);

        const { error: updateError } = await supabase
            .from("faq")
            .update({
                embedding: toVectorLiteral(embedding),
            })
            .eq("id", row.id);

        if (updateError) {
            throw updateError;
        }
    }

    console.log("Chatbot embedding backfill complete.");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
