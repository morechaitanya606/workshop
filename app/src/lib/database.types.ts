// Generated shape aligned with `supabase gen types typescript --schema public`.
// Regenerate when schema changes and commit updates to this file.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
    public: {
        Tables: {
            profiles: {
                Row: {
                    id: string;
                    full_name: string | null;
                    role: "user" | "admin";
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    full_name?: string | null;
                    role?: "user" | "admin";
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    full_name?: string | null;
                    role?: "user" | "admin";
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            workshops: {
                Row: {
                    id: string;
                    title: string;
                    description: string;
                    category: string;
                    price: number;
                    location: string;
                    city: string;
                    duration: string;
                    date: string;
                    time: string;
                    max_seats: number;
                    seats_remaining: number;
                    cover_image: string;
                    gallery_images: string[];
                    video_url: string | null;
                    social_links: Json;
                    host_name: string;
                    host_avatar: string | null;
                    host_bio: string;
                    host_experience: string | null;
                    host_social_links: Json;
                    what_you_learn: string[];
                    materials_provided: string[];
                    is_bestseller: boolean;
                    is_new: boolean;
                    created_by: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    title: string;
                    description: string;
                    category: string;
                    price: number;
                    location: string;
                    city: string;
                    duration: string;
                    date: string;
                    time: string;
                    max_seats: number;
                    seats_remaining: number;
                    cover_image: string;
                    gallery_images?: string[];
                    video_url?: string | null;
                    social_links?: Json;
                    host_name: string;
                    host_avatar?: string | null;
                    host_bio: string;
                    host_experience?: string | null;
                    host_social_links?: Json;
                    what_you_learn?: string[];
                    materials_provided?: string[];
                    is_bestseller?: boolean;
                    is_new?: boolean;
                    created_by?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    title?: string;
                    description?: string;
                    category?: string;
                    price?: number;
                    location?: string;
                    city?: string;
                    duration?: string;
                    date?: string;
                    time?: string;
                    max_seats?: number;
                    seats_remaining?: number;
                    cover_image?: string;
                    gallery_images?: string[];
                    video_url?: string | null;
                    social_links?: Json;
                    host_name?: string;
                    host_avatar?: string | null;
                    host_bio?: string;
                    host_experience?: string | null;
                    host_social_links?: Json;
                    what_you_learn?: string[];
                    materials_provided?: string[];
                    is_bestseller?: boolean;
                    is_new?: boolean;
                    created_by?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            booking_holds: {
                Row: {
                    id: string;
                    user_id: string;
                    workshop_id: string;
                    guests: number;
                    status: "active" | "confirmed" | "expired" | "released";
                    expires_at: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    workshop_id: string;
                    guests: number;
                    status?: "active" | "confirmed" | "expired" | "released";
                    expires_at: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    workshop_id?: string;
                    guests?: number;
                    status?: "active" | "confirmed" | "expired" | "released";
                    expires_at?: string;
                    created_at?: string;
                };
                Relationships: [];
            };
            bookings: {
                Row: {
                    id: string;
                    user_id: string;
                    workshop_id: string;
                    hold_id: string | null;
                    guests: number;
                    subtotal: number;
                    service_fee: number;
                    total: number;
                    status: "confirmed" | "cancelled" | "refunded";
                    payment_provider: string | null;
                    payment_intent_id: string | null;
                    first_name: string;
                    last_name: string;
                    email: string;
                    phone: string | null;
                    notes: string | null;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    workshop_id: string;
                    hold_id?: string | null;
                    guests: number;
                    subtotal: number;
                    service_fee: number;
                    total: number;
                    status?: "confirmed" | "cancelled" | "refunded";
                    payment_provider?: string | null;
                    payment_intent_id?: string | null;
                    first_name: string;
                    last_name: string;
                    email: string;
                    phone?: string | null;
                    notes?: string | null;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    workshop_id?: string;
                    hold_id?: string | null;
                    guests?: number;
                    subtotal?: number;
                    service_fee?: number;
                    total?: number;
                    status?: "confirmed" | "cancelled" | "refunded";
                    payment_provider?: string | null;
                    payment_intent_id?: string | null;
                    first_name?: string;
                    last_name?: string;
                    email?: string;
                    phone?: string | null;
                    notes?: string | null;
                    created_at?: string;
                };
                Relationships: [];
            };
            workshop_notification_preferences: {
                Row: {
                    id: string;
                    user_id: string;
                    workshop_id: string;
                    notify_similar: boolean;
                    notify_creator: boolean;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    workshop_id: string;
                    notify_similar?: boolean;
                    notify_creator?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    workshop_id?: string;
                    notify_similar?: boolean;
                    notify_creator?: boolean;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            workshop_feedback: {
                Row: {
                    id: string;
                    user_id: string;
                    workshop_id: string;
                    rating: number | null;
                    comment: string;
                    photos: string[];
                    video_url: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    workshop_id: string;
                    rating?: number | null;
                    comment: string;
                    photos?: string[];
                    video_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    workshop_id?: string;
                    rating?: number | null;
                    comment?: string;
                    photos?: string[];
                    video_url?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            create_booking_hold: {
                Args: {
                    p_user_id: string;
                    p_workshop_id: string;
                    p_guests: number;
                    p_hold_minutes?: number;
                };
                Returns: string;
            };
            confirm_booking_from_hold: {
                Args: {
                    p_hold_id: string;
                    p_user_id: string;
                    p_workshop_id: string;
                    p_payment_provider: string;
                    p_payment_intent_id: string;
                    p_first_name: string;
                    p_last_name: string;
                    p_email: string;
                    p_phone?: string | null;
                    p_notes?: string | null;
                    p_service_fee?: number;
                };
                Returns: string;
            };
        };
        Enums: {
            [_ in never]: never;
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

type PublicSchema = Database["public"];

export type DbTable<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"];
export type DbInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"];
export type DbUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"];
