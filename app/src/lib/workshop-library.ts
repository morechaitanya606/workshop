import type { Workshop } from "@/lib/data";
import type { Json, Tables, TablesInsert } from "@/lib/database.types";
import type { SupabaseServerClient } from "@/lib/supabase-server";
import { isMissingColumnError } from "@/lib/workshop-approval-compat";

/**
 * The reusable half of a workshop, stored once: `host_profiles` (one row per host) and
 * `workshop_templates` (one row per host + title + city + venue). Session rows in `workshops`
 * link to them, so the create forms can offer "pick a host" / "start from a workshop" and a
 * repeat run never creates a second host or template.
 *
 * Keys are built here and in the backfill in
 * supabase/migrations/20261016120000_host_profiles_and_workshop_templates.sql: keep the two in
 * step (trim, lower-case, collapse inner whitespace, join with "|").
 */

export function normalizeKeyPart(value: unknown): string {
    return String(value ?? "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

export function buildHostKey(hostName: string): string {
    return normalizeKeyPart(hostName);
}

export function buildTemplateKey(parts: {
    hostName: string;
    title: string;
    city: string;
    location: string;
}): string {
    return [parts.hostName, parts.title, parts.city, parts.location]
        .map(normalizeKeyPart)
        .join("|");
}

export type HostProfile = {
    id: string;
    name: string;
    bio: string;
    experience: string;
    socialLinks: { instagram?: string; youtube?: string; website?: string };
};

function readLinks(value: Json | null | undefined) {
    const links =
        typeof value === "object" && value !== null && !Array.isArray(value)
            ? (value as Record<string, Json | undefined>)
            : {};
    const pick = (key: string) => {
        const item = links[key];
        return typeof item === "string" && item.trim() ? item.trim() : undefined;
    };
    return { instagram: pick("instagram"), youtube: pick("youtube"), website: pick("website") };
}

export function mapHostProfileRow(row: Tables<"host_profiles">): HostProfile {
    return {
        id: row.id,
        name: row.name,
        bio: row.bio ?? "",
        experience: row.experience ?? "",
        socialLinks: readLinks(row.social_links),
    };
}

/**
 * A template shaped like a `Workshop` so the existing "start from" prefill and picker work on it
 * unchanged. `id` is the template id; `date` is when the template was last used.
 */
export function mapTemplateRowToWorkshop(
    row: Tables<"workshop_templates">,
    host: Tables<"host_profiles"> | null
): Workshop {
    const lastUsed = row.updated_at || row.created_at;
    const hostLinks = readLinks(host?.social_links);
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        price: row.price,
        location: row.location,
        city: row.city,
        duration: row.duration,
        date: lastUsed ? lastUsed.slice(0, 10) : "",
        time: "",
        maxSeats: row.max_seats,
        seatsRemaining: row.max_seats,
        coverImage: row.cover_image,
        galleryImages: row.gallery_images ?? [],
        videoUrl: row.video_url ?? undefined,
        rating: 0,
        reviewCount: 0,
        hostName: host?.name ?? "",
        hostAvatar: host?.avatar ?? "/images/icon.png",
        hostBio: host?.bio ?? "",
        hostExperience: host?.experience ?? undefined,
        hostSocialLinks: hostLinks,
        socialLinks: readLinks(row.social_links),
        whatYouLearn: row.what_you_learn ?? [],
        materialsProvided: row.materials_provided ?? [],
        badgeLabels: row.badge_labels ?? [],
        eventAddress: row.event_address ?? undefined,
        latitude: row.latitude ?? undefined,
        longitude: row.longitude ?? undefined,
        locationImages: row.location_images ?? [],
        earlyBirdEnabled: row.early_bird_enabled,
        earlyBirdDiscountType: row.early_bird_discount_type,
        earlyBirdDiscountValue: row.early_bird_discount_value,
        earlyBirdDaysAfterListing: row.early_bird_days_after_listing,
        createdAt: lastUsed || undefined,
    };
}

export type WorkshopLibrary = {
    /** False when the migration creating the library tables has not been applied yet. */
    available: boolean;
    hosts: HostProfile[];
    templates: Workshop[];
};

/** Hosts and templates a user may reuse: everything for an admin, their own for a host. */
export async function listWorkshopLibrary(
    client: SupabaseServerClient,
    scope: { createdBy?: string } = {}
): Promise<WorkshopLibrary> {
    let hostQuery = client.from("host_profiles").select("*").order("name", { ascending: true });
    let templateQuery = client
        .from("workshop_templates")
        .select("*")
        .order("updated_at", { ascending: false });
    if (scope.createdBy) {
        hostQuery = hostQuery.eq("created_by", scope.createdBy);
        templateQuery = templateQuery.eq("created_by", scope.createdBy);
    }

    const [hostResult, templateResult] = await Promise.all([hostQuery, templateQuery]);
    const error = hostResult.error ?? templateResult.error;
    if (error) {
        if (isMissingColumnError(error)) return { available: false, hosts: [], templates: [] };
        throw error;
    }

    const hostRows = hostResult.data ?? [];
    // A host's own templates may point at a profile someone else created; load those too.
    const hostsById = new Map(hostRows.map((row) => [row.id, row]));
    const missingHostIds = [
        ...new Set(
            (templateResult.data ?? [])
                .map((row) => row.host_profile_id)
                .filter((id): id is string => Boolean(id) && !hostsById.has(id as string))
        ),
    ];
    if (missingHostIds.length > 0) {
        const { data } = await client.from("host_profiles").select("*").in("id", missingHostIds);
        for (const row of data ?? []) hostsById.set(row.id, row);
    }

    return {
        available: true,
        hosts: hostRows.map(mapHostProfileRow),
        templates: (templateResult.data ?? []).map((row) =>
            mapTemplateRowToWorkshop(
                row,
                row.host_profile_id ? (hostsById.get(row.host_profile_id) ?? null) : null
            )
        ),
    };
}

/**
 * Records the host and workshop of a freshly created batch in the library (creating each only if
 * its key is new, otherwise refreshing it with the latest details) and links the session rows to
 * them. Best effort by design: the workshop itself is already saved, so a library problem must
 * never fail the request, and before the migration is applied this is a silent no-op.
 */
export async function syncWorkshopLibrary(
    client: SupabaseServerClient,
    createdRows: TablesInsert<"workshops">[],
    createdBy: string
): Promise<void> {
    const row = createdRows[0];
    if (!row || !row.host_name?.trim()) return;

    try {
        const hostId = await upsertHostProfile(client, row, createdBy);
        const templateId = await upsertWorkshopTemplate(client, row, createdBy, hostId);

        const { error } = await client
            .from("workshops")
            .update({ host_profile_id: hostId, template_id: templateId })
            .in(
                "id",
                createdRows.map((created) => created.id)
            );
        if (error) throw error;
    } catch (error) {
        if (isMissingColumnError(error)) return;
        console.error("Failed to update the host / workshop library.", error);
    }
}

async function upsertHostProfile(
    client: SupabaseServerClient,
    row: TablesInsert<"workshops">,
    createdBy: string
): Promise<string> {
    const nameKey = buildHostKey(row.host_name);
    const details = {
        name: row.host_name.trim(),
        bio: row.host_bio,
        experience: row.host_experience ?? null,
        social_links: row.host_social_links ?? {},
    };

    const existing = await client
        .from("host_profiles")
        .select("id")
        .eq("name_key", nameKey)
        .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
        const { error } = await client
            .from("host_profiles")
            .update(details)
            .eq("id", existing.data.id);
        if (error) throw error;
        return existing.data.id;
    }

    const inserted = await client
        .from("host_profiles")
        .insert({ ...details, name_key: nameKey, created_by: createdBy })
        .select("id")
        .single();
    if (!inserted.error) return inserted.data.id;

    // Lost a race with another request creating the same host: use theirs.
    if (inserted.error.code === "23505") {
        const winner = await client
            .from("host_profiles")
            .select("id")
            .eq("name_key", nameKey)
            .single();
        if (winner.error) throw winner.error;
        return winner.data.id;
    }
    throw inserted.error;
}

async function upsertWorkshopTemplate(
    client: SupabaseServerClient,
    row: TablesInsert<"workshops">,
    createdBy: string,
    hostProfileId: string
): Promise<string> {
    const templateKey = buildTemplateKey({
        hostName: row.host_name,
        title: row.title,
        city: row.city,
        location: row.location,
    });
    const details = {
        host_profile_id: hostProfileId,
        title: row.title,
        description: row.description,
        category: row.category,
        price: row.price,
        location: row.location,
        city: row.city,
        duration: row.duration,
        max_seats: row.max_seats,
        cover_image: row.cover_image,
        gallery_images: row.gallery_images ?? [],
        video_url: row.video_url ?? null,
        social_links: row.social_links ?? {},
        what_you_learn: row.what_you_learn ?? [],
        materials_provided: row.materials_provided ?? [],
        badge_labels: row.badge_labels ?? [],
        event_address: row.event_address ?? null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null,
        location_images: row.location_images ?? [],
        early_bird_enabled: row.early_bird_enabled ?? false,
        early_bird_discount_type: row.early_bird_discount_type ?? "percentage",
        early_bird_discount_value: row.early_bird_discount_value ?? 0,
        early_bird_days_after_listing: row.early_bird_days_after_listing ?? 0,
    };

    const existing = await client
        .from("workshop_templates")
        .select("id")
        .eq("template_key", templateKey)
        .maybeSingle();
    if (existing.error) throw existing.error;
    if (existing.data) {
        const { error } = await client
            .from("workshop_templates")
            .update(details)
            .eq("id", existing.data.id);
        if (error) throw error;
        return existing.data.id;
    }

    const inserted = await client
        .from("workshop_templates")
        .insert({ ...details, template_key: templateKey, created_by: createdBy })
        .select("id")
        .single();
    if (!inserted.error) return inserted.data.id;

    if (inserted.error.code === "23505") {
        const winner = await client
            .from("workshop_templates")
            .select("id")
            .eq("template_key", templateKey)
            .single();
        if (winner.error) throw winner.error;
        return winner.data.id;
    }
    throw inserted.error;
}
