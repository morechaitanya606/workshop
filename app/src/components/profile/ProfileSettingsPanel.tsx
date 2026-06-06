"use client";

import type { ChangeEvent, RefObject } from "react";
import Image from "next/image";
import { getInitials } from "@/lib/utils";

type ProfileSettingsPanelProps = {
    avatarInputRef: RefObject<HTMLInputElement | null>;
    avatarUploading: boolean;
    onAvatarUpload: (event: ChangeEvent<HTMLInputElement>) => void;
    onRemoveAvatar: () => void;
    onSaveProfile: () => void;
    profileAvatar: string | null;
    profileDob: string;
    profileError: string | null;
    profileLoading: boolean;
    profileMessage: string | null;
    profileName: string;
    profilePhone: string;
    profileSaving: boolean;
    setProfileDob: (value: string) => void;
    setProfileName: (value: string) => void;
    setProfilePhone: (value: string) => void;
    userEmail: string | null | undefined;
};

export default function ProfileSettingsPanel({
    avatarInputRef,
    avatarUploading,
    onAvatarUpload,
    onRemoveAvatar,
    onSaveProfile,
    profileAvatar,
    profileDob,
    profileError,
    profileLoading,
    profileMessage,
    profileName,
    profilePhone,
    profileSaving,
    setProfileDob,
    setProfileName,
    setProfilePhone,
    userEmail,
}: ProfileSettingsPanelProps) {
    return (
        <div className="bg-white rounded-2xl p-8 shadow-soft border border-dark/5">
            <h2 className="text-xl font-playfair font-medium mb-6">Account Settings</h2>
            <div className="space-y-6">
                <div>
                    <label className="block text-sm font-medium text-dark/70 mb-2">
                        Profile Photo
                    </label>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-cream border border-clay/40 overflow-hidden flex items-center justify-center text-sm font-inter font-semibold text-dark-secondary">
                            {profileAvatar ? (
                                <Image
                                    src={profileAvatar}
                                    alt={profileName || "Profile"}
                                    width={64}
                                    height={64}
                                    className="h-full w-full object-cover"
                                />
                            ) : (
                                getInitials(profileName || userEmail || "User")
                            )}
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 rounded-full border border-clay/40 px-4 py-2 text-xs font-inter font-semibold text-dark-secondary cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={onAvatarUpload}
                                    ref={avatarInputRef}
                                    className="sr-only"
                                    disabled={avatarUploading || profileLoading}
                                />
                                {avatarUploading ? "Uploading..." : "Upload photo"}
                            </label>
                            {profileAvatar && (
                                <button
                                    type="button"
                                    onClick={onRemoveAvatar}
                                    className="text-xs font-inter font-semibold text-dark-muted hover:text-terracotta transition-colors"
                                >
                                    Remove
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-dark/70 mb-2">Username</label>
                    <input
                        type="text"
                        value={profileName}
                        onChange={(event) => setProfileName(event.target.value)}
                        placeholder="Enter your username"
                        className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark"
                        disabled={profileLoading}
                    />
                    <p className="text-xs text-dark/50 mt-2">
                        This name appears on your public workshop reviews.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-dark/70 mb-2">
                        Date of Birth
                    </label>
                    <input
                        type="date"
                        value={profileDob}
                        onChange={(event) => setProfileDob(event.target.value)}
                        className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark"
                        disabled={profileLoading}
                    />
                    <p className="text-xs text-dark/50 mt-2">
                        We use this for age-appropriate recommendations.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-dark/70 mb-2">
                        Phone Number
                    </label>
                    <input
                        type="tel"
                        value={profilePhone}
                        onChange={(event) => setProfilePhone(event.target.value)}
                        placeholder="Enter your phone number"
                        className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark"
                        disabled={profileLoading}
                    />
                    <p className="text-xs text-dark/50 mt-2">
                        We&apos;ll only use this for important updates.
                    </p>
                </div>

                <div>
                    <label className="block text-sm font-medium text-dark/70 mb-2">
                        Email Address
                    </label>
                    <input
                        type="text"
                        disabled
                        value={userEmail || ""}
                        className="w-full max-w-md bg-cream-50 border border-dark/10 rounded-xl px-4 py-3 text-dark cursor-not-allowed"
                    />
                    <p className="text-xs text-dark/50 mt-2">
                        Your email address is managed by your authentication provider.
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onSaveProfile}
                        disabled={profileSaving || profileLoading}
                        className="btn-primary !px-6 !py-2.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {profileSaving ? "Saving..." : "Save changes"}
                    </button>
                    {profileMessage && (
                        <span className="text-xs font-inter text-emerald-700">
                            {profileMessage}
                        </span>
                    )}
                    {profileError && (
                        <span className="text-xs font-inter text-red-600">{profileError}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
