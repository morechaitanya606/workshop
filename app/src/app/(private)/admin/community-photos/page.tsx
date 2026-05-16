"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { ImagePlus, Loader2, Save, Trash2, Upload } from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
    createAdminCommunityPhoto,
    deleteAdminCommunityPhoto,
    getAdminCommunityPhotos,
    toApiErrorMessage,
    updateAdminCommunityPhoto,
    uploadMedia,
    type AdminCommunityPhoto,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";

const emptyForm = {
    imageUrl: "",
    altText: "",
    sortOrder: 0,
    isActive: true,
};

export default function AdminCommunityPhotosPage() {
    const { session } = useAuth();
    const [photos, setPhotos] = useState<AdminCommunityPhoto[]>([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [updatingId, setUpdatingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);

    const activePhotoCount = useMemo(
        () => photos.filter((photo) => photo.isActive).length,
        [photos]
    );

    const accessToken = session?.access_token;

    const loadPhotos = async () => {
        if (!accessToken) return;
        setLoading(true);
        setError(null);

        try {
            const result = await getAdminCommunityPhotos(accessToken);
            setPhotos(result.photos);
        } catch (loadError) {
            setError(toApiErrorMessage(loadError, "Unable to load community photos."));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void loadPhotos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken]);

    const updateForm = (field: keyof typeof form, value: string | number | boolean) => {
        setForm((current) => ({
            ...current,
            [field]: value,
        }));
    };

    const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || !accessToken) return;

        setUploading(true);
        setError(null);
        setMessage(null);

        try {
            const result = await uploadMedia(accessToken, file);
            setForm((current) => ({
                ...current,
                imageUrl: result.url,
                altText: current.altText || file.name.replace(/\.[^.]+$/, ""),
            }));
            setMessage("Photo uploaded. Add it to publish on the homepage.");
        } catch (uploadError) {
            setError(toApiErrorMessage(uploadError, "Unable to upload community photo."));
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!accessToken) return;

        setSaving(true);
        setError(null);
        setMessage(null);

        try {
            const result = await createAdminCommunityPhoto(accessToken, form);
            setPhotos((current) => [result.photo, ...current]);
            setForm({
                ...emptyForm,
                sortOrder: photos.length + 1,
            });
            setMessage("Community photo added. The homepage will show up to 12 active photos.");
        } catch (saveError) {
            setError(toApiErrorMessage(saveError, "Unable to add community photo."));
        } finally {
            setSaving(false);
        }
    };

    const handleToggleActive = async (photo: AdminCommunityPhoto) => {
        if (!accessToken) return;
        setUpdatingId(photo.id);
        setError(null);
        setMessage(null);

        try {
            const result = await updateAdminCommunityPhoto(accessToken, photo.id, {
                isActive: !photo.isActive,
            });
            setPhotos((current) =>
                current.map((item) => (item.id === photo.id ? result.photo : item))
            );
            setMessage(result.photo.isActive ? "Photo is visible." : "Photo is hidden.");
        } catch (updateError) {
            setError(toApiErrorMessage(updateError, "Unable to update community photo."));
        } finally {
            setUpdatingId(null);
        }
    };

    const handleDelete = async (photo: AdminCommunityPhoto) => {
        if (!accessToken) return;
        const confirmed = window.confirm("Delete this community photo from the homepage gallery?");
        if (!confirmed) return;

        setDeletingId(photo.id);
        setError(null);
        setMessage(null);

        try {
            await deleteAdminCommunityPhoto(accessToken, photo.id);
            setPhotos((current) => current.filter((item) => item.id !== photo.id));
            setMessage("Community photo deleted.");
        } catch (deleteError) {
            setError(toApiErrorMessage(deleteError, "Unable to delete community photo."));
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="text-sm font-inter font-semibold uppercase tracking-[0.18em] text-terracotta">
                    Admin
                </p>
                <h1 className="heading-lg">Community Photos</h1>
                <p className="text-body text-dark-muted">
                    Upload community photos for the homepage gallery. Only the first 12 active
                    photos are shown.
                </p>
            </div>

            {error && (
                <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                    {error}
                </div>
            )}
            {message && (
                <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-inter text-green-700">
                    {message}
                </div>
            )}

            <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
                <form
                    onSubmit={handleSubmit}
                    className="rounded-3xl border border-clay/30 bg-white p-5 shadow-card sm:p-6"
                >
                    <div className="mb-5 flex items-center gap-3">
                        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-terracotta/10 text-terracotta">
                            <ImagePlus className="h-5 w-5" />
                        </span>
                        <div>
                            <h2 className="font-playfair text-2xl font-bold text-dark">
                                Add Photo
                            </h2>
                            <p className="text-sm font-inter text-dark-muted">
                                Upload an image or paste a URL.
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <label className="block">
                            <span className="mb-2 block text-sm font-inter font-semibold text-dark">
                                Photo URL
                            </span>
                            <input
                                type="text"
                                value={form.imageUrl}
                                onChange={(event) => updateForm("imageUrl", event.target.value)}
                                className="input-field"
                                placeholder="/uploads/... or https://..."
                                required
                            />
                        </label>

                        <label className="inline-flex cursor-pointer items-center gap-2 rounded-2xl border border-clay/40 bg-cream px-4 py-3 text-sm font-inter font-semibold text-dark transition-colors hover:bg-white">
                            {uploading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Upload className="h-4 w-4" />
                            )}
                            {uploading ? "Uploading..." : "Upload From Device"}
                            <input
                                type="file"
                                accept="image/jpeg,image/png,image/webp"
                                onChange={handleUpload}
                                disabled={uploading || saving}
                                className="sr-only"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-inter font-semibold text-dark">
                                Alt Text
                            </span>
                            <input
                                type="text"
                                value={form.altText}
                                onChange={(event) => updateForm("altText", event.target.value)}
                                className="input-field"
                                placeholder="People at a pottery workshop"
                            />
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-inter font-semibold text-dark">
                                Sort Order
                            </span>
                            <input
                                type="number"
                                min={0}
                                max={1000}
                                value={form.sortOrder}
                                onChange={(event) =>
                                    updateForm("sortOrder", Number(event.target.value))
                                }
                                className="input-field"
                            />
                        </label>

                        <label className="flex items-center gap-3 rounded-2xl border border-clay/30 bg-cream px-4 py-3 text-sm font-inter text-dark">
                            <input
                                type="checkbox"
                                checked={form.isActive}
                                onChange={(event) => updateForm("isActive", event.target.checked)}
                                className="h-4 w-4 rounded border-clay text-terracotta"
                            />
                            Show on homepage
                        </label>

                        {form.imageUrl && (
                            <div className="overflow-hidden rounded-2xl border border-clay/30 bg-cream">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={form.imageUrl}
                                    alt={form.altText || "Community photo preview"}
                                    className="h-48 w-full object-cover"
                                />
                            </div>
                        )}

                        <button type="submit" className="btn-primary w-full" disabled={saving}>
                            {saving ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                <Save className="h-4 w-4" />
                            )}
                            {saving ? "Adding..." : "Add Community Photo"}
                        </button>
                    </div>
                </form>

                <section className="rounded-3xl border border-clay/30 bg-white p-5 shadow-card sm:p-6">
                    <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                        <div>
                            <h2 className="font-playfair text-2xl font-bold text-dark">
                                Homepage Gallery
                            </h2>
                            <p className="text-sm font-inter text-dark-muted">
                                {activePhotoCount} active photos. Homepage displays 12.
                            </p>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex min-h-[280px] items-center justify-center">
                            <Loader2 className="h-8 w-8 animate-spin text-terracotta" />
                        </div>
                    ) : photos.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-clay/50 bg-cream px-6 py-12 text-center">
                            <ImagePlus className="mx-auto mb-3 h-8 w-8 text-terracotta" />
                            <p className="font-inter font-semibold text-dark">
                                No community photos yet.
                            </p>
                        </div>
                    ) : (
                        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {photos.map((photo, index) => (
                                <article
                                    key={photo.id}
                                    className="overflow-hidden rounded-2xl border border-clay/30 bg-cream"
                                >
                                    <div className="relative">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                            src={photo.imageUrl}
                                            alt={photo.altText || `Community photo ${index + 1}`}
                                            className="h-44 w-full object-cover"
                                        />
                                        <span className="absolute left-3 top-3 rounded-full bg-white/95 px-3 py-1 text-xs font-inter font-semibold text-dark shadow-sm">
                                            #{photo.sortOrder}
                                        </span>
                                    </div>
                                    <div className="space-y-3 p-4">
                                        <div>
                                            <p className="truncate text-sm font-inter font-semibold text-dark">
                                                {photo.altText || "Community photo"}
                                            </p>
                                            <p className="text-xs font-inter text-dark-muted">
                                                {photo.isActive ? "Visible" : "Hidden"}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={() => void handleToggleActive(photo)}
                                                disabled={updatingId === photo.id}
                                                className="btn-secondary flex-1 !px-3 !py-2 text-xs"
                                            >
                                                {updatingId === photo.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : null}
                                                {photo.isActive ? "Hide" : "Show"}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => void handleDelete(photo)}
                                                disabled={deletingId === photo.id}
                                                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-inter font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
                                                aria-label="Delete photo"
                                            >
                                                {deletingId === photo.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </section>
            </div>
        </AdminShell>
    );
}
