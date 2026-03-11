import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const client = createClient(supabaseUrl, supabaseKey);

async function check() {
    const { data, error } = await client.from("workshops").select("id, title, seats_remaining, max_seats").eq("id", "3");
    console.log("DB Result:", JSON.stringify({ data, error }, null, 2));
}
check();
