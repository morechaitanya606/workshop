import "server-only";

import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Community } from "@/lib/communities";
import { normalizeCommunitySlug, slugifyCommunityTitle } from "@/lib/communities";
import type { CommunityCreateInput, CommunityJoinInput } from "@/lib/validators";

type LocalCommunityJoinRequest = {
    id: string;
    communityId: string;
    communitySlug: string;
    fullName: string;
    email: string;
    phone: string;
    note: string;
    status: "pending";
    createdAt: string;
};

type LocalCommunityStore = {
    communities: Community[];
    joinRequests: LocalCommunityJoinRequest[];
};

const DATA_DIR = path.join(process.cwd(), ".local-data");
const DATA_FILE = path.join(DATA_DIR, "communities.json");

const EMPTY_STORE: LocalCommunityStore = {
    communities: [],
    joinRequests: [],
};
const STORE_READ_RETRIES = 3;
const STORE_READ_RETRY_DELAY_MS = 25;

const READ_ONLY_FS_CODES = new Set(["EROFS", "EACCES", "EPERM"]);

function isReadOnlyFsError(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException)?.code;
    return typeof code === "string" && READ_ONLY_FS_CODES.has(code);
}

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureStoreFile(): Promise<boolean> {
    try {
        await mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        if (isReadOnlyFsError(error)) return false;
        throw error;
    }

    try {
        await readFile(DATA_FILE, "utf8");
    } catch (error) {
        if (isReadOnlyFsError(error)) return false;
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            throw error;
        }

        try {
            await writeFile(DATA_FILE, JSON.stringify(EMPTY_STORE, null, 2), "utf8");
        } catch (writeError) {
            if (isReadOnlyFsError(writeError)) return false;
            throw writeError;
        }
    }

    return true;
}

async function readStore(): Promise<LocalCommunityStore> {
    const fsWritable = await ensureStoreFile();

    if (!fsWritable) {
        return { ...EMPTY_STORE };
    }

    let lastError: unknown = null;

    for (let attempt = 1; attempt <= STORE_READ_RETRIES; attempt += 1) {
        try {
            const raw = await readFile(DATA_FILE, "utf8");
            if (!raw.trim()) {
                return { ...EMPTY_STORE };
            }

            const parsed = JSON.parse(raw) as Partial<LocalCommunityStore>;
            return {
                communities: Array.isArray(parsed.communities) ? parsed.communities : [],
                joinRequests: Array.isArray(parsed.joinRequests) ? parsed.joinRequests : [],
            };
        } catch (error) {
            if (isReadOnlyFsError(error) || (error as NodeJS.ErrnoException).code === "ENOENT") {
                return { ...EMPTY_STORE };
            }

            lastError = error;

            const isRetryableParseError = error instanceof SyntaxError;
            if (attempt < STORE_READ_RETRIES && isRetryableParseError) {
                await delay(STORE_READ_RETRY_DELAY_MS * attempt);
                continue;
            }

            throw error;
        }
    }

    throw lastError instanceof Error
        ? lastError
        : new Error("Failed to read local communities store.");
}

async function writeStore(store: LocalCommunityStore) {
    try {
        await mkdir(DATA_DIR, { recursive: true });
    } catch (error) {
        if (isReadOnlyFsError(error)) return;
        throw error;
    }

    const tempFile = `${DATA_FILE}.${randomUUID()}.tmp`;

    try {
        await writeFile(tempFile, JSON.stringify(store, null, 2), "utf8");
        await rename(tempFile, DATA_FILE);
    } catch (error) {
        if (isReadOnlyFsError(error)) return;
        throw error;
    } finally {
        await rm(tempFile, { force: true }).catch(() => undefined);
    }
}

function sortByCreatedAtDesc<T extends { createdAt: string }>(items: T[]) {
    return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function listLocalCommunities(limit = 24): Promise<Community[]> {
    const store = await readStore();
    return sortByCreatedAtDesc(store.communities).slice(0, limit);
}

export async function getLocalCommunityBySlug(slug: string): Promise<Community | null> {
    const store = await readStore();
    const normalizedSlug = normalizeCommunitySlug(slug);

    return (
        store.communities.find(
            (community) => normalizeCommunitySlug(community.slug) === normalizedSlug
        ) || null
    );
}

export async function generateUniqueLocalCommunitySlug(title: string) {
    const store = await readStore();
    const existingSlugs = new Set(store.communities.map((community) => community.slug));
    const baseSlug = slugifyCommunityTitle(title) || "community";
    let attempt = 1;

    while (attempt <= 25) {
        const suffix = attempt === 1 ? "" : `-${attempt}`;
        const slug = `${baseSlug.slice(0, Math.max(1, 72 - suffix.length))}${suffix}`;
        if (!existingSlugs.has(slug)) {
            return slug;
        }
        attempt += 1;
    }

    return `${baseSlug.slice(0, 60)}-${Date.now().toString().slice(-6)}`;
}

export async function createLocalCommunity(
    input: CommunityCreateInput,
    slug: string
): Promise<Community> {
    const store = await readStore();
    const existingCommunity = store.communities.find((community) => community.slug === slug);
    if (existingCommunity) {
        return existingCommunity;
    }

    const createdAt = new Date().toISOString();
    const community: Community = {
        id: `local-community-${randomUUID()}`,
        slug,
        title: input.title.trim(),
        summary: input.summary.trim(),
        description: input.description.trim(),
        category: input.category.trim(),
        city: input.city.trim(),
        hostName: input.hostName.trim(),
        hostEmail: input.hostEmail.trim(),
        hostPhone: input.hostPhone.trim(),
        meetingFormat: input.meetingFormat.trim(),
        meetupFrequency: input.meetupFrequency.trim(),
        coverImage: input.coverImage?.trim() || null,
        instagramUrl: input.instagramUrl.trim() || null,
        websiteUrl: input.websiteUrl.trim() || null,
        whatsappUrl: input.whatsappUrl.trim() || null,
        createdAt,
        isMock: false,
    };

    store.communities.unshift(community);
    await writeStore(store);

    return community;
}

export async function createLocalCommunityJoinRequest(
    community: Community,
    input: CommunityJoinInput
) {
    const store = await readStore();
    const joinRequest: LocalCommunityJoinRequest = {
        id: `local-community-join-${randomUUID()}`,
        communityId: community.id,
        communitySlug: community.slug,
        fullName: input.fullName.trim(),
        email: input.email.trim(),
        phone: input.phone.trim(),
        note: input.note.trim(),
        status: "pending",
        createdAt: new Date().toISOString(),
    };

    store.joinRequests.unshift(joinRequest);
    await writeStore(store);

    return joinRequest;
}
