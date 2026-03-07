import { NextResponse } from "next/server";
import { createSupabaseServiceClient, isSupabaseServiceConfigured } from "@/lib/supabase-server";

export async function GET() {
    if (!isSupabaseServiceConfigured) {
        return NextResponse.json({ error: "No service role" }, { status: 500 });
    }

    try {
        const serviceClient = createSupabaseServiceClient();
        const { data: workshops, error } = await serviceClient.from("workshops").select("*");

        if (error) throw error;

        let updated = 0;
        let logs: string[] = [];

        for (const workshop of workshops || []) {
            let changed = false;
            let newCoverImage = workshop.cover_image;
            let newHostAvatar = workshop.host_avatar;
            let newGalleryImages = workshop.gallery_images;

            if (newCoverImage && (newCoverImage.endsWith(".jpg") || newCoverImage.endsWith(".png"))) {
                newCoverImage = newCoverImage.replace(/\.(jpg|png)$/, ".webp");
                changed = true;
            }

            if (newHostAvatar && (newHostAvatar.endsWith(".jpg") || newHostAvatar.endsWith(".png"))) {
                newHostAvatar = newHostAvatar.replace(/\.(jpg|png)$/, ".webp");
                changed = true;
            }

            if (Array.isArray(newGalleryImages)) {
                newGalleryImages = newGalleryImages.map((img: string) => {
                    if (img.endsWith(".jpg") || img.endsWith(".png")) {
                        changed = true;
                        return img.replace(/\.(jpg|png)$/, ".webp");
                    }
                    return img;
                });
            }

            if (changed) {
                const { error: updateError } = await serviceClient
                    .from("workshops")
                    .update({
                        cover_image: newCoverImage,
                        gallery_images: newGalleryImages,
                        host_avatar: newHostAvatar
                    })
                    .eq("id", workshop.id);

                if (updateError) {
                    logs.push(`Error updating ${workshop.id}: ${updateError.message}`);
                } else {
                    updated++;
                    logs.push(`Updated ${workshop.id}`);
                }
            }
        }

        return NextResponse.json({ updated, logs });
    } catch (e) {
        return NextResponse.json({ error: String(e) }, { status: 500 });
    }
}
