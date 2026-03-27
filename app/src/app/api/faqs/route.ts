import { NextResponse } from "next/server";
import { loadFaqRows } from "@/lib/faqs";

export async function GET() {
    const faqs = await loadFaqRows();

    return NextResponse.json(
        {
            faqs,
        },
        {
            headers: {
                "Cache-Control": "no-store",
            },
        }
    );
}
