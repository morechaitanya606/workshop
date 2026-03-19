export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
    // Allows to automatically instantiate createClient with right options
    // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
    __InternalSupabase: {
        PostgrestVersion: "14.4";
    };
    public: {
        Tables: {
            booking_holds: {
                Row: {
                    created_at: string;
                    expires_at: string;
                    guests: number;
                    id: string;
                    status: string;
                    user_id: string;
                    workshop_id: string;
                };
                Insert: {
                    created_at?: string;
                    expires_at: string;
                    guests: number;
                    id?: string;
                    status?: string;
                    user_id: string;
                    workshop_id: string;
                };
                Update: {
                    created_at?: string;
                    expires_at?: string;
                    guests?: number;
                    id?: string;
                    status?: string;
                    user_id?: string;
                    workshop_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "booking_holds_workshop_id_fkey";
                        columns: ["workshop_id"];
                        isOneToOne: false;
                        referencedRelation: "workshops";
                        referencedColumns: ["id"];
                    },
                ];
            };
            bookings: {
                Row: {
                    created_at: string;
                    email: string;
                    first_name: string;
                    guests: number;
                    hold_id: string | null;
                    id: string;
                    last_name: string;
                    notes: string | null;
                    payment_intent_id: string | null;
                    payment_provider: string | null;
                    phone: string | null;
                    service_fee: number;
                    status: string;
                    subtotal: number;
                    total: number;
                    user_id: string;
                    workshop_id: string;
                };
                Insert: {
                    created_at?: string;
                    email: string;
                    first_name: string;
                    guests: number;
                    hold_id?: string | null;
                    id?: string;
                    last_name: string;
                    notes?: string | null;
                    payment_intent_id?: string | null;
                    payment_provider?: string | null;
                    phone?: string | null;
                    service_fee: number;
                    status?: string;
                    subtotal: number;
                    total: number;
                    user_id: string;
                    workshop_id: string;
                };
                Update: {
                    created_at?: string;
                    email?: string;
                    first_name?: string;
                    guests?: number;
                    hold_id?: string | null;
                    id?: string;
                    last_name?: string;
                    notes?: string | null;
                    payment_intent_id?: string | null;
                    payment_provider?: string | null;
                    phone?: string | null;
                    service_fee?: number;
                    status?: string;
                    subtotal?: number;
                    total?: number;
                    user_id?: string;
                    workshop_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "bookings_hold_id_fkey";
                        columns: ["hold_id"];
                        isOneToOne: false;
                        referencedRelation: "booking_holds";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "bookings_workshop_id_fkey";
                        columns: ["workshop_id"];
                        isOneToOne: false;
                        referencedRelation: "workshops";
                        referencedColumns: ["id"];
                    },
                ];
            };
            coupon_redemptions: {
                Row: {
                    booking_id: string | null;
                    coupon_id: string | null;
                    created_at: string | null;
                    discount_applied: number;
                    id: string;
                    user_id: string | null;
                };
                Insert: {
                    booking_id?: string | null;
                    coupon_id?: string | null;
                    created_at?: string | null;
                    discount_applied: number;
                    id?: string;
                    user_id?: string | null;
                };
                Update: {
                    booking_id?: string | null;
                    coupon_id?: string | null;
                    created_at?: string | null;
                    discount_applied?: number;
                    id?: string;
                    user_id?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "coupon_redemptions_booking_id_fkey";
                        columns: ["booking_id"];
                        isOneToOne: false;
                        referencedRelation: "bookings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "coupon_redemptions_coupon_id_fkey";
                        columns: ["coupon_id"];
                        isOneToOne: false;
                        referencedRelation: "coupons";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "coupon_redemptions_user_id_fkey";
                        columns: ["user_id"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    },
                ];
            };
            coupons: {
                Row: {
                    applicable_categories: string[] | null;
                    applicable_workshop_ids: string[] | null;
                    code: string;
                    created_at: string | null;
                    created_by: string | null;
                    discount_type: string;
                    discount_value: number;
                    id: string;
                    is_active: boolean | null;
                    max_uses: number | null;
                    min_order_amount: number | null;
                    updated_at: string | null;
                    used_count: number | null;
                    valid_from: string | null;
                    valid_until: string | null;
                };
                Insert: {
                    applicable_categories?: string[] | null;
                    applicable_workshop_ids?: string[] | null;
                    code: string;
                    created_at?: string | null;
                    created_by?: string | null;
                    discount_type: string;
                    discount_value: number;
                    id?: string;
                    is_active?: boolean | null;
                    max_uses?: number | null;
                    min_order_amount?: number | null;
                    updated_at?: string | null;
                    used_count?: number | null;
                    valid_from?: string | null;
                    valid_until?: string | null;
                };
                Update: {
                    applicable_categories?: string[] | null;
                    applicable_workshop_ids?: string[] | null;
                    code?: string;
                    created_at?: string | null;
                    created_by?: string | null;
                    discount_type?: string;
                    discount_value?: number;
                    id?: string;
                    is_active?: boolean | null;
                    max_uses?: number | null;
                    min_order_amount?: number | null;
                    updated_at?: string | null;
                    used_count?: number | null;
                    valid_from?: string | null;
                    valid_until?: string | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "coupons_created_by_fkey";
                        columns: ["created_by"];
                        isOneToOne: false;
                        referencedRelation: "profiles";
                        referencedColumns: ["id"];
                    },
                ];
            };
            email_delivery_logs: {
                Row: {
                    created_at: string;
                    error_message: string | null;
                    id: string;
                    recipient_email: string;
                    reference_id: string | null;
                    sent_at: string | null;
                    status: Database["public"]["Enums"]["email_delivery_status"];
                    subject: string;
                    template_name: string;
                };
                Insert: {
                    created_at?: string;
                    error_message?: string | null;
                    id?: string;
                    recipient_email: string;
                    reference_id?: string | null;
                    sent_at?: string | null;
                    status?: Database["public"]["Enums"]["email_delivery_status"];
                    subject: string;
                    template_name: string;
                };
                Update: {
                    created_at?: string;
                    error_message?: string | null;
                    id?: string;
                    recipient_email?: string;
                    reference_id?: string | null;
                    sent_at?: string | null;
                    status?: Database["public"]["Enums"]["email_delivery_status"];
                    subject?: string;
                    template_name?: string;
                };
                Relationships: [];
            };
            host_applications: {
                Row: {
                    application_type: string;
                    bio: string;
                    created_at: string;
                    details: Json;
                    email: string;
                    id: string;
                    name: string;
                    portfolio_url: string | null;
                    status: Database["public"]["Enums"]["host_application_status"];
                    updated_at: string;
                    user_id: string;
                };
                Insert: {
                    application_type?: string;
                    bio: string;
                    created_at?: string;
                    details?: Json;
                    email: string;
                    id?: string;
                    name: string;
                    portfolio_url?: string | null;
                    status?: Database["public"]["Enums"]["host_application_status"];
                    updated_at?: string;
                    user_id: string;
                };
                Update: {
                    application_type?: string;
                    bio?: string;
                    created_at?: string;
                    details?: Json;
                    email?: string;
                    id?: string;
                    name?: string;
                    portfolio_url?: string | null;
                    status?: Database["public"]["Enums"]["host_application_status"];
                    updated_at?: string;
                    user_id?: string;
                };
                Relationships: [];
            };
            host_earnings: {
                Row: {
                    amount: number;
                    booking_id: string;
                    created_at: string;
                    fee_deducted: number;
                    host_id: string;
                    id: string;
                    status: Database["public"]["Enums"]["earning_status"];
                };
                Insert: {
                    amount: number;
                    booking_id: string;
                    created_at?: string;
                    fee_deducted?: number;
                    host_id: string;
                    id?: string;
                    status?: Database["public"]["Enums"]["earning_status"];
                };
                Update: {
                    amount?: number;
                    booking_id?: string;
                    created_at?: string;
                    fee_deducted?: number;
                    host_id?: string;
                    id?: string;
                    status?: Database["public"]["Enums"]["earning_status"];
                };
                Relationships: [
                    {
                        foreignKeyName: "host_earnings_booking_id_fkey";
                        columns: ["booking_id"];
                        isOneToOne: true;
                        referencedRelation: "bookings";
                        referencedColumns: ["id"];
                    },
                    {
                        foreignKeyName: "host_earnings_host_id_fkey";
                        columns: ["host_id"];
                        isOneToOne: false;
                        referencedRelation: "hosts";
                        referencedColumns: ["id"];
                    },
                ];
            };
            hosts: {
                Row: {
                    avatar_url: string | null;
                    bio: string | null;
                    created_at: string;
                    id: string;
                    name: string;
                    social_links: Json;
                    updated_at: string;
                    user_id: string | null;
                };
                Insert: {
                    avatar_url?: string | null;
                    bio?: string | null;
                    created_at?: string;
                    id?: string;
                    name: string;
                    social_links?: Json;
                    updated_at?: string;
                    user_id?: string | null;
                };
                Update: {
                    avatar_url?: string | null;
                    bio?: string | null;
                    created_at?: string;
                    id?: string;
                    name?: string;
                    social_links?: Json;
                    updated_at?: string;
                    user_id?: string | null;
                };
                Relationships: [];
            };
            payment_webhook_events: {
                Row: {
                    event_key: string;
                    event_type: string;
                    id: string;
                    payload: Json;
                    processed_at: string | null;
                    provider: string;
                    received_at: string;
                };
                Insert: {
                    event_key: string;
                    event_type: string;
                    id?: string;
                    payload?: Json;
                    processed_at?: string | null;
                    provider: string;
                    received_at?: string;
                };
                Update: {
                    event_key?: string;
                    event_type?: string;
                    id?: string;
                    payload?: Json;
                    processed_at?: string | null;
                    provider?: string;
                    received_at?: string;
                };
                Relationships: [];
            };
            payouts: {
                Row: {
                    amount: number;
                    created_at: string;
                    host_id: string;
                    id: string;
                    reference_note: string | null;
                    status: Database["public"]["Enums"]["payout_status"];
                    updated_at: string;
                };
                Insert: {
                    amount: number;
                    created_at?: string;
                    host_id: string;
                    id?: string;
                    reference_note?: string | null;
                    status?: Database["public"]["Enums"]["payout_status"];
                    updated_at?: string;
                };
                Update: {
                    amount?: number;
                    created_at?: string;
                    host_id?: string;
                    id?: string;
                    reference_note?: string | null;
                    status?: Database["public"]["Enums"]["payout_status"];
                    updated_at?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "payouts_host_id_fkey";
                        columns: ["host_id"];
                        isOneToOne: false;
                        referencedRelation: "hosts";
                        referencedColumns: ["id"];
                    },
                ];
            };
            platform_settings: {
                Row: {
                    created_at: string | null;
                    id: string;
                    setting_key: string;
                    setting_value: Json;
                    updated_at: string | null;
                };
                Insert: {
                    created_at?: string | null;
                    id?: string;
                    setting_key: string;
                    setting_value: Json;
                    updated_at?: string | null;
                };
                Update: {
                    created_at?: string | null;
                    id?: string;
                    setting_key?: string;
                    setting_value?: Json;
                    updated_at?: string | null;
                };
                Relationships: [];
            };
            profiles: {
                Row: {
                    created_at: string;
                    date_of_birth: string | null;
                    avatar_url?: string | null;
                    full_name: string | null;
                    id: string;
                    phone_number: string | null;
                    role: string;
                    updated_at: string;
                };
                Insert: {
                    created_at?: string;
                    date_of_birth?: string | null;
                    avatar_url?: string | null;
                    full_name?: string | null;
                    id: string;
                    phone_number?: string | null;
                    role?: string;
                    updated_at?: string;
                };
                Update: {
                    created_at?: string;
                    date_of_birth?: string | null;
                    avatar_url?: string | null;
                    full_name?: string | null;
                    id?: string;
                    phone_number?: string | null;
                    role?: string;
                    updated_at?: string;
                };
                Relationships: [];
            };
            user_favorites: {
                Row: {
                    created_at: string;
                    id: string;
                    user_id: string;
                    workshop_id: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    user_id: string;
                    workshop_id: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    user_id?: string;
                    workshop_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "user_favorites_workshop_id_fkey";
                        columns: ["workshop_id"];
                        isOneToOne: false;
                        referencedRelation: "workshops";
                        referencedColumns: ["id"];
                    },
                ];
            };
            workshop_feedback: {
                Row: {
                    comment: string;
                    created_at: string;
                    id: string;
                    photos: string[];
                    rating: number | null;
                    updated_at: string;
                    user_id: string;
                    video_url: string | null;
                    workshop_id: string;
                };
                Insert: {
                    comment: string;
                    created_at?: string;
                    id?: string;
                    photos?: string[];
                    rating?: number | null;
                    updated_at?: string;
                    user_id: string;
                    video_url?: string | null;
                    workshop_id: string;
                };
                Update: {
                    comment?: string;
                    created_at?: string;
                    id?: string;
                    photos?: string[];
                    rating?: number | null;
                    updated_at?: string;
                    user_id?: string;
                    video_url?: string | null;
                    workshop_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "workshop_feedback_workshop_id_fkey";
                        columns: ["workshop_id"];
                        isOneToOne: false;
                        referencedRelation: "workshops";
                        referencedColumns: ["id"];
                    },
                ];
            };
            workshop_notification_preferences: {
                Row: {
                    created_at: string;
                    id: string;
                    notify_creator: boolean;
                    notify_similar: boolean;
                    updated_at: string;
                    user_id: string;
                    workshop_id: string;
                };
                Insert: {
                    created_at?: string;
                    id?: string;
                    notify_creator?: boolean;
                    notify_similar?: boolean;
                    updated_at?: string;
                    user_id: string;
                    workshop_id: string;
                };
                Update: {
                    created_at?: string;
                    id?: string;
                    notify_creator?: boolean;
                    notify_similar?: boolean;
                    updated_at?: string;
                    user_id?: string;
                    workshop_id?: string;
                };
                Relationships: [
                    {
                        foreignKeyName: "workshop_notification_preferences_workshop_id_fkey";
                        columns: ["workshop_id"];
                        isOneToOne: false;
                        referencedRelation: "workshops";
                        referencedColumns: ["id"];
                    },
                ];
            };
            waitlists: {
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
            workshops: {
                Row: {
                    category: string;
                    city: string;
                    cover_image: string;
                    created_at: string;
                    created_by: string | null;
                    date: string;
                    description: string;
                    duration: string;
                    gallery_images: string[];
                    host_avatar: string | null;
                    host_bio: string;
                    host_experience: string | null;
                    host_id: string | null;
                    host_name: string;
                    host_social_links: Json;
                    host_user_id: string | null;
                    id: string;
                    is_bestseller: boolean;
                    is_new: boolean;
                    location: string;
                    materials_provided: string[];
                    max_seats: number;
                    price: number;
                    seats_remaining: number;
                    social_links: Json;
                    time: string;
                    title: string;
                    updated_at: string;
                    video_url: string | null;
                    what_you_learn: string[];
                    badge_labels?: string[] | null;
                    event_address?: string | null;
                    latitude?: number | null;
                    longitude?: number | null;
                    location_images?: string[] | null;
                };
                Insert: {
                    category: string;
                    city: string;
                    cover_image: string;
                    created_at?: string;
                    created_by?: string | null;
                    date: string;
                    description: string;
                    duration: string;
                    gallery_images?: string[];
                    host_avatar?: string | null;
                    host_bio: string;
                    host_experience?: string | null;
                    host_id?: string | null;
                    host_name: string;
                    host_social_links?: Json;
                    host_user_id?: string | null;
                    id: string;
                    is_bestseller?: boolean;
                    is_new?: boolean;
                    location: string;
                    materials_provided?: string[];
                    max_seats: number;
                    price: number;
                    seats_remaining: number;
                    social_links?: Json;
                    time: string;
                    title: string;
                    updated_at?: string;
                    video_url?: string | null;
                    what_you_learn?: string[];
                    badge_labels?: string[] | null;
                    event_address?: string | null;
                    latitude?: number | null;
                    longitude?: number | null;
                    location_images?: string[] | null;
                };
                Update: {
                    category?: string;
                    city?: string;
                    cover_image?: string;
                    created_at?: string;
                    created_by?: string | null;
                    date?: string;
                    description?: string;
                    duration?: string;
                    gallery_images?: string[];
                    host_avatar?: string | null;
                    host_bio?: string;
                    host_experience?: string | null;
                    host_id?: string | null;
                    host_name?: string;
                    host_social_links?: Json;
                    host_user_id?: string | null;
                    id?: string;
                    is_bestseller?: boolean;
                    is_new?: boolean;
                    location?: string;
                    materials_provided?: string[];
                    max_seats?: number;
                    price?: number;
                    seats_remaining?: number;
                    social_links?: Json;
                    time?: string;
                    title?: string;
                    updated_at?: string;
                    video_url?: string | null;
                    what_you_learn?: string[];
                    badge_labels?: string[] | null;
                    event_address?: string | null;
                    latitude?: number | null;
                    longitude?: number | null;
                    location_images?: string[] | null;
                };
                Relationships: [
                    {
                        foreignKeyName: "workshops_host_id_fkey";
                        columns: ["host_id"];
                        isOneToOne: false;
                        referencedRelation: "hosts";
                        referencedColumns: ["id"];
                    },
                ];
            };
        };
        Views: {
            [_ in never]: never;
        };
        Functions: {
            confirm_booking_from_hold: {
                Args: {
                    p_email: string;
                    p_first_name: string;
                    p_hold_id: string;
                    p_last_name: string;
                    p_notes?: string;
                    p_payment_intent_id: string;
                    p_payment_provider: string;
                    p_phone?: string;
                    p_service_fee?: number;
                    p_user_id: string;
                    p_workshop_id: string;
                };
                Returns: string;
            };
            create_booking_hold: {
                Args: {
                    p_guests: number;
                    p_hold_minutes?: number;
                    p_user_id: string;
                    p_workshop_id: string;
                };
                Returns: string;
            };
            user_has_any_role: {
                Args: { required_roles: string[] };
                Returns: boolean;
            };
            user_has_role: { Args: { required_role: string }; Returns: boolean };
        };
        Enums: {
            earning_status: "pending" | "available" | "paid";
            email_delivery_status: "pending" | "sent" | "failed";
            host_application_status: "pending" | "approved" | "rejected";
            payout_status: "processing" | "completed";
        };
        CompositeTypes: {
            [_ in never]: never;
        };
    };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type DbTable<
    DefaultSchemaTableNameOrOptions extends
        | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
              DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
          DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
          Row: infer R;
      }
        ? R
        : never
    : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
            DefaultSchema["Views"])
      ? (DefaultSchema["Tables"] &
            DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
            Row: infer R;
        }
          ? R
          : never
      : never;

export type DbInsert<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema["Tables"]
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
          Insert: infer I;
      }
        ? I
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
      ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
            Insert: infer I;
        }
          ? I
          : never
      : never;

export type DbUpdate<
    DefaultSchemaTableNameOrOptions extends
        | keyof DefaultSchema["Tables"]
        | { schema: keyof DatabaseWithoutInternals },
    TableName extends DefaultSchemaTableNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
        : never = never,
> = DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
          Update: infer U;
      }
        ? U
        : never
    : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
      ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
            Update: infer U;
        }
          ? U
          : never
      : never;

export type Enums<
    DefaultSchemaEnumNameOrOptions extends
        | keyof DefaultSchema["Enums"]
        | { schema: keyof DatabaseWithoutInternals },
    EnumName extends DefaultSchemaEnumNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
        : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
    : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
      ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
      : never;

export type CompositeTypes<
    PublicCompositeTypeNameOrOptions extends
        | keyof DefaultSchema["CompositeTypes"]
        | { schema: keyof DatabaseWithoutInternals },
    CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
        schema: keyof DatabaseWithoutInternals;
    }
        ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
        : never = never,
> = PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
}
    ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
    : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
      ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
      : never;

export const Constants = {
    public: {
        Enums: {
            earning_status: ["pending", "available", "paid"],
            email_delivery_status: ["pending", "sent", "failed"],
            host_application_status: ["pending", "approved", "rejected"],
            payout_status: ["processing", "completed"],
        },
    },
} as const;
