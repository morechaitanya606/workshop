import { apiRequest } from "./client";

export type AuthMeResponse = {
    user: {
        id: string;
        email: string | null;
        fullName: string | null;
    };
    role: "admin" | "host" | "user";
};

export function getAuthMe(accessToken: string) {
    return apiRequest<AuthMeResponse>("/api/auth/me", {
        accessToken,
        cache: "no-store",
    });
}

export type ProfileResponse = {
    profile: {
        fullName: string | null;
        avatarUrl: string | null;
        dateOfBirth: string | null;
        phoneNumber: string | null;
    };
};

export function getProfile(accessToken: string) {
    return apiRequest<ProfileResponse>("/api/profile", {
        accessToken,
        cache: "no-store",
    });
}

export function updateProfile(
    accessToken: string,
    payload: {
        fullName?: string;
        avatarUrl?: string;
        dateOfBirth?: string;
        phoneNumber?: string;
    }
) {
    return apiRequest<ProfileResponse>("/api/profile", {
        method: "PATCH",
        accessToken,
        body: payload,
    });
}
