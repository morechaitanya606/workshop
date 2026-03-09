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
                    role: "user" | "host" | "admin";
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id: string;
                    full_name?: string | null;
                    role?: "user" | "host" | "admin";
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    full_name?: string | null;
                    role?: "user" | "host" | "admin";
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
                    host_id: string | null;
                    created_by: string | null;
                    host_user_id: string | null;
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
                    host_id?: string | null;
                    created_by?: string | null;
                    host_user_id?: string | null;
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
                    host_id?: string | null;
                    created_by?: string | null;
                    host_user_id?: string | null;
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
            hosts: {
                Row: {
                    id: string;
                    user_id: string | null;
                    name: string;
                    bio: string | null;
                    avatar_url: string | null;
                    social_links: Json;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id?: string | null;
                    name: string;
                    bio?: string | null;
                    avatar_url?: string | null;
                    social_links?: Json;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string | null;
                    name?: string;
                    bio?: string | null;
                    avatar_url?: string | null;
                    social_links?: Json;
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            user_favorites: {
                Row: {
                    id: string;
                    user_id: string;
                    workshop_id: string;
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    workshop_id: string;
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    workshop_id?: string;
                    created_at?: string;
                };
                Relationships: [];
            };
            payment_webhook_events: {
                Row: {
                    id: string;
                    provider: string;
                    event_key: string;
                    event_type: string;
                    payload: Json;
                    received_at: string;
                    processed_at: string | null;
                };
                Insert: {
                    id?: string;
                    provider: string;
                    event_key: string;
                    event_type: string;
                    payload?: Json;
                    received_at?: string;
                    processed_at?: string | null;
                };
                Update: {
                    id?: string;
                    provider?: string;
                    event_key?: string;
                    event_type?: string;
                    payload?: Json;
                    received_at?: string;
                    processed_at?: string | null;
                };
                Relationships: [];
            };
            email_delivery_logs: {
                Row: {
                    id: string;
                    recipient_email: string;
                    subject: string;
                    template_name: string;
                    status: Database["public"]["Enums"]["email_delivery_status"];
                    error_message: string | null;
                    reference_id: string | null;
                    created_at: string;
                    sent_at: string | null;
                };
                Insert: {
                    id?: string;
                    recipient_email: string;
                    subject: string;
                    template_name: string;
                    status?: Database["public"]["Enums"]["email_delivery_status"];
                    error_message?: string | null;
                    reference_id?: string | null;
                    created_at?: string;
                    sent_at?: string | null;
                };
                Update: {
                    id?: string;
                    recipient_email?: string;
                    subject?: string;
                    template_name?: string;
                    status?: Database["public"]["Enums"]["email_delivery_status"];
                    error_message?: string | null;
                    reference_id?: string | null;
                    created_at?: string;
                    sent_at?: string | null;
                };
                Relationships: [];
            };
            host_applications: {
                Row: {
                    id: string;
                    user_id: string;
                    name: string;
                    email: string;
                    bio: string;
                    portfolio_url: string | null;
                    status: Database["public"]["Enums"]["host_application_status"];
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    user_id: string;
                    name: string;
                    email: string;
                    bio: string;
                    portfolio_url?: string | null;
                    status?: Database["public"]["Enums"]["host_application_status"];
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    user_id?: string;
                    name?: string;
                    email?: string;
                    bio?: string;
                    portfolio_url?: string | null;
                    status?: Database["public"]["Enums"]["host_application_status"];
                    created_at?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            host_earnings: {
                Row: {
                    id: string;
                    host_id: string;
                    booking_id: string;
                    amount: number;
                    fee_deducted: number;
                    status: Database["public"]["Enums"]["earning_status"];
                    created_at: string;
                };
                Insert: {
                    id?: string;
                    host_id: string;
                    booking_id: string;
                    amount: number;
                    fee_deducted?: number;
                    status?: Database["public"]["Enums"]["earning_status"];
                    created_at?: string;
                };
                Update: {
                    id?: string;
                    host_id?: string;
                    booking_id?: string;
                    amount?: number;
                    fee_deducted?: number;
                    status?: Database["public"]["Enums"]["earning_status"];
                    created_at?: string;
                };
                Relationships: [];
            };
            payouts: {
                Row: {
                    id: string;
                    host_id: string;
                    amount: number;
                    status: Database["public"]["Enums"]["payout_status"];
                    reference_note: string | null;
                    created_at: string;
                    updated_at: string;
                };
                Insert: {
                    id?: string;
                    host_id: string;
                    amount: number;
                    status?: Database["public"]["Enums"]["payout_status"];
                    reference_note?: string | null;
                    created_at?: string;
                    updated_at?: string;
                };
                Update: {
                    id?: string;
                    host_id?: string;
                    amount?: number;
                    status?: Database["public"]["Enums"]["payout_status"];
                    reference_note?: string | null;
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
            user_has_role: {
                Args: {
                    required_role: string;
                };
                Returns: boolean;
            };
            user_has_any_role: {
                Args: {
                    required_roles: string[];
                };
                Returns: boolean;
            };
        };
        Enums: {
            email_delivery_status: "pending" | "sent" | "failed";
            earning_status: "pending" | "available" | "paid";
            host_application_status: "pending" | "approved" | "rejected";
            payout_status: "processing" | "completed";
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
