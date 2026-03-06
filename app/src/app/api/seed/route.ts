import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { mockWorkshops } from "@/lib/data";

export async function GET() {
    try {
        const serviceClient = createSupabaseServiceClient();
        const results = [];

        for (const mockWorkshop of mockWorkshops) {
            const insertPayload = {
                id: mockWorkshop.id,
                title: mockWorkshop.title,
                description: mockWorkshop.description,
                category: mockWorkshop.category,
                price: mockWorkshop.price,
                location: mockWorkshop.location,
                city: mockWorkshop.city,
                duration: mockWorkshop.duration,
                date: mockWorkshop.date,
                time: mockWorkshop.time,
                max_seats: mockWorkshop.maxSeats,
                seats_remaining: mockWorkshop.seatsRemaining,
                cover_image: mockWorkshop.coverImage,
                gallery_images: mockWorkshop.galleryImages,
                video_url: mockWorkshop.videoUrl || null,
                social_links: mockWorkshop.socialLinks || {},
                host_name: mockWorkshop.hostName,
                host_avatar: mockWorkshop.hostAvatar,
                host_bio: mockWorkshop.hostBio,
                host_experience: mockWorkshop.hostExperience || null,
                host_social_links: mockWorkshop.hostSocialLinks || {},
                what_you_learn: mockWorkshop.whatYouLearn,
                materials_provided: mockWorkshop.materialsProvided,
                is_bestseller: Boolean(mockWorkshop.isBestseller),
                is_new: Boolean(mockWorkshop.isNew),
                created_by: null
            };

            const { error } = await serviceClient.from("workshops").upsert(insertPayload, {
                onConflict: "id",
            });
            results.push({ id: mockWorkshop.id, error });
        }

        return NextResponse.json({ success: true, count: mockWorkshops.length, results });
    } catch (error) {
        return NextResponse.json({ success: false, error: String(error) }, { status: 500 });
    }
}
