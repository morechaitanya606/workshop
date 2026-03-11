import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase-server";

export async function GET() {
    try {
        const client = createSupabaseServiceClient();
        const { data, error } = await client
            .from("workshops")
            .select("id, title, seats_remaining")
            .eq("id", "3")
            .single();
        return NextResponse.json({ data, error });
    } catch (e: any) {
        return NextResponse.json({ error: String(e) });
    }
}
