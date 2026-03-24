import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";
import { requireAdminUser, jsonError } from "@/lib/api-auth";

export async function GET(_request: NextRequest) {
    try {
        const supabase = createSupabaseServiceClient();
        const { data, error } = await supabase.from("platform_settings").select("*");

        if (error) {
            return jsonError(error.message, 500);
        }

        const settings = data.reduce(
            (acc, row) => {
                acc[row.setting_key] = row.setting_value;
                return acc;
            },
            {} as Record<string, any>
        );

        return NextResponse.json({ settings }, { status: 200 });
    } catch (error) {
        return jsonError("Internal Server Error", 500);
    }
}

export async function PATCH(request: NextRequest) {
    const auth = await requireAdminUser(request);
    if (!auth.ok) return auth.response;

    try {
        const body = await request.json();
        const { settings } = body;

        if (!settings || typeof settings !== "object") {
            return jsonError("Invalid payload. Expected { settings: object }", 400);
        }

        const supabase = createSupabaseServiceClient();

        const upserts = Object.entries(settings).map(([key, value]) => ({
            setting_key: key,
            setting_value: value as any,
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
            .from("platform_settings")
            .upsert(upserts, { onConflict: "setting_key" });

        if (error) {
            return jsonError(error.message, 500);
        }

        return NextResponse.json({ success: true }, { status: 200 });
    } catch (error) {
        return jsonError("Internal Server Error", 500);
    }
}
