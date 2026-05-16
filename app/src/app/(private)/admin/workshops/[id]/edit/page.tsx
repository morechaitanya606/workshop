"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check, Upload } from "lucide-react";
import { categories, PAST_EVENTS_CATEGORY_ID, type Workshop } from "@/lib/data";
import { useAuth } from "@/lib/auth-context";
import AdminShell from "@/components/admin/AdminShell";
import {
    getAdminWorkshop,
    toApiErrorMessage,
    updateAdminWorkshop,
    uploadMedia,
} from "@/lib/api-client";
import { workshopUpdateSchema } from "@/lib/validators";

function toList(value: string) {
    return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
}

type WorkshopEditForm = {
    title: string;
    description: string;
    category: string;
    price: string;
    location: string;
    city: string;
    duration: string;
    date: string;
    time: string;
    maxSeats: string;
    coverImage: string;
    galleryImages: string;
    videoUrl: string;
    instagramLink: string;
    youtubeLink: string;
    websiteLink: string;
    hostName: string;
    hostBio: string;
    hostExperience: string;
    hostInstagram: string;
    hostYoutube: string;
    hostWebsite: string;
    whatYouLearn: string;
    materialsProvided: string;
    badgeLabels: string;
    eventAddress: string;
    latitude: string;
    longitude: string;
    locationImages: string;
    earlyBirdEnabled: string;
    earlyBirdDiscountType: string;
    earlyBirdDiscountValue: string;
    earlyBirdDaysAfterListing: string;
};

function workshopToFormValues(workshop: Workshop): WorkshopEditForm {
    return {
        title: workshop.title || "",
        description: workshop.description || "",
        category: workshop.category || "",
        price: String(workshop.price || ""),
        location: workshop.location || "",
        city: workshop.city || "",
        duration: workshop.duration || "",
        date: workshop.date || "",
        time: workshop.time || "",
        maxSeats: String(workshop.maxSeats || ""),
        coverImage: workshop.coverImage || "",
        galleryImages: Array.isArray(workshop.galleryImages)
            ? workshop.galleryImages.join("\n")
            : "",
        videoUrl: workshop.videoUrl || "",
        instagramLink: workshop.socialLinks?.instagram || "",
        youtubeLink: workshop.socialLinks?.youtube || "",
        websiteLink: workshop.socialLinks?.website || "",
        hostName: workshop.hostName || "",
        hostBio: workshop.hostBio || "",
        hostExperience: workshop.hostExperience || "",
        hostInstagram: workshop.hostSocialLinks?.instagram || "",
        hostYoutube: workshop.hostSocialLinks?.youtube || "",
        hostWebsite: workshop.hostSocialLinks?.website || "",
        whatYouLearn: Array.isArray(workshop.whatYouLearn) ? workshop.whatYouLearn.join("\n") : "",
        materialsProvided: Array.isArray(workshop.materialsProvided)
            ? workshop.materialsProvided.join("\n")
            : "",
        badgeLabels: Array.isArray(workshop.badgeLabels) ? workshop.badgeLabels.join("\n") : "",
        eventAddress: workshop.eventAddress || "",
        latitude:
            typeof workshop.latitude === "number" && Number.isFinite(workshop.latitude)
                ? String(workshop.latitude)
                : "",
        longitude:
            typeof workshop.longitude === "number" && Number.isFinite(workshop.longitude)
                ? String(workshop.longitude)
                : "",
        locationImages: Array.isArray(workshop.locationImages)
            ? workshop.locationImages.join("\n")
            : "",
        earlyBirdEnabled: workshop.earlyBirdEnabled ? "true" : "false",
        earlyBirdDiscountType: workshop.earlyBirdDiscountType || "percentage",
        earlyBirdDiscountValue: String(workshop.earlyBirdDiscountValue || ""),
        earlyBirdDaysAfterListing: String(workshop.earlyBirdDaysAfterListing || ""),
    };
}

export default function AdminEditWorkshopPage() {
    const params = useParams<{ id: string }>();
    const router = useRouter();
    const { session } = useAuth();
    const workshopId = params?.id;
    const categoryOptions = useMemo(
        () =>
            categories.filter(
                (item) => item.id !== "trending" && item.id !== PAST_EVENTS_CATEGORY_ID
            ),
        []
    );

    const [loadingWorkshop, setLoadingWorkshop] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [uploadingGallery, setUploadingGallery] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [uploadingLocation, setUploadingLocation] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof WorkshopEditForm, string>>>(
        {}
    );
    const [form, setForm] = useState<WorkshopEditForm>({
        title: "",
        description: "",
        category: "",
        price: "",
        location: "",
        city: "",
        duration: "",
        date: "",
        time: "",
        maxSeats: "",
        coverImage: "",
        galleryImages: "",
        videoUrl: "",
        instagramLink: "",
        youtubeLink: "",
        websiteLink: "",
        hostName: "",
        hostBio: "",
        hostExperience: "",
        hostInstagram: "",
        hostYoutube: "",
        hostWebsite: "",
        whatYouLearn: "",
        materialsProvided: "",
        badgeLabels: "",
        eventAddress: "",
        latitude: "",
        longitude: "",
        locationImages: "",
        earlyBirdEnabled: "false",
        earlyBirdDiscountType: "percentage",
        earlyBirdDiscountValue: "",
        earlyBirdDaysAfterListing: "",
    });
    const [categorySelection, setCategorySelection] = useState("");
    const [customCategory, setCustomCategory] = useState("");
    const coverPreview = form.coverImage.trim();
    const galleryPreviews = toList(form.galleryImages);
    const locationPreviews = toList(form.locationImages);

    const syncWorkshopForm = useCallback(
        (workshop: Workshop) => {
            const nextCategory = workshop.category || "";
            const isKnownCategory = categoryOptions.some((item) => item.label === nextCategory);

            setForm(workshopToFormValues(workshop));
            setCategorySelection(
                nextCategory ? (isKnownCategory ? nextCategory : "__other__") : ""
            );
            setCustomCategory(isKnownCategory ? "" : nextCategory);
        },
        [categoryOptions]
    );

    const renderImagePreview = (src: string, alt: string) => (
        <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-gray-200 bg-cream-100">
            <Image src={src} alt={alt} fill className="object-cover" sizes="160px" />
        </div>
    );

    const update = (field: keyof WorkshopEditForm, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => {
            if (!prev[field]) return prev;
            return { ...prev, [field]: undefined };
        });
    };

    const renderFieldError = (field: keyof WorkshopEditForm) =>
        fieldErrors[field] ? (
            <p className="mt-1 text-xs font-inter text-red-600">{fieldErrors[field]}</p>
        ) : null;

    const handleCategoryChange = (value: string) => {
        setCategorySelection(value);
        if (value === "__other__") {
            update("category", customCategory);
            return;
        }
        update("category", value);
    };

    const handleCustomCategoryChange = (value: string) => {
        setCustomCategory(value);
        if (categorySelection === "__other__") {
            update("category", value);
        }
    };

    const uploadOneFile = async (file: File) => {
        if (!session?.access_token) {
            throw new Error("Your session expired. Please log in again.");
        }
        const result = await uploadMedia(session.access_token, file);
        return String(result.url || "");
    };

    const handleCoverUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setUploadingCover(true);
        setError(null);
        try {
            const url = await uploadOneFile(file);
            update("coverImage", url);
        } catch (uploadError) {
            setError(toApiErrorMessage(uploadError, "Unable to upload cover image."));
        } finally {
            setUploadingCover(false);
        }
    };

    const handleGalleryUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!files.length) return;

        setUploadingGallery(true);
        setError(null);
        try {
            const urls = await Promise.all(files.map((file) => uploadOneFile(file)));
            const merged = Array.from(new Set([...toList(form.galleryImages), ...urls]));
            update("galleryImages", merged.join("\n"));
        } catch (uploadError) {
            setError(toApiErrorMessage(uploadError, "Unable to upload gallery images."));
        } finally {
            setUploadingGallery(false);
        }
    };

    const handleVideoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file) return;

        setUploadingVideo(true);
        setError(null);
        try {
            const url = await uploadOneFile(file);
            update("videoUrl", url);
        } catch (uploadError) {
            setError(toApiErrorMessage(uploadError, "Unable to upload video."));
        } finally {
            setUploadingVideo(false);
        }
    };

    const handleLocationUpload = async (event: ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(event.target.files || []);
        event.target.value = "";
        if (!files.length) return;

        setUploadingLocation(true);
        setError(null);
        try {
            const urls = await Promise.all(files.map((file) => uploadOneFile(file)));
            const merged = Array.from(new Set([...toList(form.locationImages), ...urls]));
            update("locationImages", merged.join("\n"));
        } catch (uploadError) {
            setError(toApiErrorMessage(uploadError, "Unable to upload location images."));
        } finally {
            setUploadingLocation(false);
        }
    };

    useEffect(() => {
        let cancelled = false;

        const loadWorkshop = async () => {
            if (!session?.access_token || !workshopId) return;
            setLoadingWorkshop(true);
            setError(null);

            try {
                const result = await getAdminWorkshop(session.access_token, workshopId);
                const workshop = result.workshop;
                if (!cancelled && workshop) {
                    syncWorkshopForm(workshop);
                }
            } catch (fetchError) {
                if (!cancelled) {
                    setError(toApiErrorMessage(fetchError, "Unable to load workshop."));
                }
            } finally {
                if (!cancelled) {
                    setLoadingWorkshop(false);
                }
            }
        };

        loadWorkshop();
        return () => {
            cancelled = true;
        };
    }, [session, workshopId, syncWorkshopForm]);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!session?.access_token || !workshopId) return;

        const payload = {
            title: form.title.trim(),
            description: form.description.trim(),
            category: form.category.trim(),
            price: Number(form.price),
            location: form.location.trim(),
            city: form.city.trim(),
            duration: form.duration.trim(),
            date: form.date.trim(),
            time: form.time.trim(),
            maxSeats: Number(form.maxSeats),
            coverImage: form.coverImage.trim(),
            galleryImages: toList(form.galleryImages),
            videoUrl: form.videoUrl.trim(),
            socialLinks: {
                instagram: form.instagramLink.trim(),
                youtube: form.youtubeLink.trim(),
                website: form.websiteLink.trim(),
            },
            hostName: form.hostName.trim(),
            hostBio: form.hostBio.trim(),
            hostExperience: form.hostExperience.trim(),
            hostSocialLinks: {
                instagram: form.hostInstagram.trim(),
                youtube: form.hostYoutube.trim(),
                website: form.hostWebsite.trim(),
            },
            whatYouLearn: toList(form.whatYouLearn),
            materialsProvided: toList(form.materialsProvided),
            badgeLabels: toList(form.badgeLabels),
            eventAddress: form.eventAddress.trim(),
            latitude: form.latitude ? Number(form.latitude) : undefined,
            longitude: form.longitude ? Number(form.longitude) : undefined,
            locationImages: toList(form.locationImages),
            earlyBirdEnabled: form.earlyBirdEnabled === "true",
            earlyBirdDiscountType: form.earlyBirdDiscountType,
            earlyBirdDiscountValue: form.earlyBirdDiscountValue
                ? Number(form.earlyBirdDiscountValue)
                : 0,
            earlyBirdDaysAfterListing: form.earlyBirdDaysAfterListing
                ? Number(form.earlyBirdDaysAfterListing)
                : 0,
        };

        const validation = workshopUpdateSchema.safeParse(payload);
        if (!validation.success) {
            const nextFieldErrors: Partial<Record<keyof WorkshopEditForm, string>> = {};
            for (const issue of validation.error.issues) {
                const [pathRoot, pathNested] = issue.path;
                let field: keyof WorkshopEditForm | null = null;

                if (pathRoot === "socialLinks") {
                    field =
                        pathNested === "instagram"
                            ? "instagramLink"
                            : pathNested === "youtube"
                              ? "youtubeLink"
                              : pathNested === "website"
                                ? "websiteLink"
                                : null;
                } else if (pathRoot === "hostSocialLinks") {
                    field =
                        pathNested === "instagram"
                            ? "hostInstagram"
                            : pathNested === "youtube"
                              ? "hostYoutube"
                              : pathNested === "website"
                                ? "hostWebsite"
                                : null;
                } else if (typeof pathRoot === "string" && pathRoot in form) {
                    field = pathRoot as keyof WorkshopEditForm;
                }

                if (field && !nextFieldErrors[field]) {
                    nextFieldErrors[field] = issue.message;
                }
            }

            setFieldErrors(nextFieldErrors);
            setError("Please fix the highlighted fields and try again.");
            return;
        }

        setSaving(true);
        setSaved(false);
        setError(null);
        setFieldErrors({});
        try {
            const result = await updateAdminWorkshop(
                session.access_token,
                workshopId,
                validation.data
            );
            if (result.workshop) {
                syncWorkshopForm(result.workshop);
            }
            setSaved(true);
            router.refresh();
        } catch (submitError) {
            setError(toApiErrorMessage(submitError, "Unable to update workshop."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <AdminShell>
            <div className="mb-8 flex items-center gap-3">
                <Link href="/admin/workshops" className="btn-secondary !py-2 !px-3">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-1">
                        Workshops
                    </p>
                    <h1 className="heading-md">Edit Workshop</h1>
                </div>
            </div>

            {loadingWorkshop ? (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading workshop...
                </div>
            ) : (
                <form
                    onSubmit={handleSubmit}
                    className="bg-white rounded-2xl shadow-soft p-6 space-y-5"
                >
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2 border-b border-gray-100 pb-3">
                            <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                Basics
                            </h2>
                            <p className="mt-1 text-xs font-inter text-dark-muted">
                                Core workshop metadata shown in listings.
                            </p>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Title
                            </label>
                            <input
                                value={form.title}
                                onChange={(e) => update("title", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("title")}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Description
                            </label>
                            <textarea
                                value={form.description}
                                onChange={(e) => update("description", e.target.value)}
                                rows={4}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("description")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Category
                            </label>
                            <select
                                value={categorySelection}
                                onChange={(e) => handleCategoryChange(e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            >
                                <option value="">Select category</option>
                                {categoryOptions.map((item) => (
                                    <option key={item.id} value={item.label}>
                                        {item.label}
                                    </option>
                                ))}
                                <option value="__other__">Other (type below)</option>
                            </select>
                            {categorySelection === "__other__" && (
                                <div className="mt-3">
                                    <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                        Custom Category
                                    </label>
                                    <input
                                        value={customCategory}
                                        onChange={(e) => handleCustomCategoryChange(e.target.value)}
                                        placeholder="e.g. Calligraphy"
                                        className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                        required
                                    />
                                </div>
                            )}
                            {renderFieldError("category")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Price
                            </label>
                            <input
                                type="number"
                                value={form.price}
                                onChange={(e) => update("price", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("price")}
                        </div>

                        <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3">
                            <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                Scheduling
                            </h2>
                            <p className="mt-1 text-xs font-inter text-dark-muted">
                                Venue, date, timing and seat limits.
                            </p>
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Location Title
                            </label>
                            <input
                                value={form.location}
                                onChange={(e) => update("location", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("location")}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Event Address
                            </label>
                            <input
                                value={form.eventAddress}
                                onChange={(e) => update("eventAddress", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                            />
                            {renderFieldError("eventAddress")}
                            {(form.eventAddress || form.latitude || form.longitude) && (
                                <div className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs font-inter text-dark-muted">
                                    <p className="font-semibold text-dark">Saved location</p>
                                    {form.eventAddress && (
                                        <p className="mt-1">{form.eventAddress}</p>
                                    )}
                                    {(form.latitude || form.longitude) && (
                                        <p className="mt-1">
                                            {form.latitude || "No latitude"},{" "}
                                            {form.longitude || "No longitude"}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Latitude (Optional)
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={form.latitude}
                                onChange={(e) => update("latitude", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                            />
                            {renderFieldError("latitude")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Longitude (Optional)
                            </label>
                            <input
                                type="number"
                                step="any"
                                value={form.longitude}
                                onChange={(e) => update("longitude", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                            />
                            {renderFieldError("longitude")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                City
                            </label>
                            <input
                                value={form.city}
                                onChange={(e) => update("city", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("city")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Date
                            </label>
                            <input
                                type="date"
                                value={form.date}
                                onChange={(e) => update("date", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("date")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Time
                            </label>
                            <input
                                type="time"
                                value={form.time}
                                onChange={(e) => update("time", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("time")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Duration
                            </label>
                            <input
                                value={form.duration}
                                onChange={(e) => update("duration", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("duration")}
                        </div>

                        <div>
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Max Seats
                            </label>
                            <input
                                type="number"
                                value={form.maxSeats}
                                onChange={(e) => update("maxSeats", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("maxSeats")}
                        </div>

                        <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3">
                            <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                Media
                            </h2>
                            <p className="mt-1 text-xs font-inter text-dark-muted">
                                Cover, gallery and optional video assets.
                            </p>
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Cover Image URL
                            </label>
                            <input
                                type="text"
                                inputMode="url"
                                value={form.coverImage}
                                onChange={(e) => update("coverImage", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                required
                            />
                            {renderFieldError("coverImage")}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                    {uploadingCover ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Upload className="w-3.5 h-3.5" />
                                    )}
                                    Upload From Device
                                    <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleCoverUpload}
                                        disabled={uploadingCover || saving}
                                    />
                                </label>
                                <p className="text-xs font-inter text-dark-muted">
                                    You can also paste a public Google Drive image link.
                                </p>
                            </div>
                            {coverPreview && (
                                <div className="mt-3 max-w-xs">
                                    {renderImagePreview(coverPreview, "Saved cover image")}
                                </div>
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Gallery Image URLs (newline or comma separated)
                            </label>
                            <textarea
                                value={form.galleryImages}
                                onChange={(e) => update("galleryImages", e.target.value)}
                                rows={3}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                placeholder={"https://.../image1.jpg\nhttps://.../image2.jpg"}
                            />
                            {renderFieldError("galleryImages")}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                    {uploadingGallery ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Upload className="w-3.5 h-3.5" />
                                    )}
                                    Upload Gallery Images
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={handleGalleryUpload}
                                        disabled={uploadingGallery || saving}
                                    />
                                </label>
                                <p className="text-xs font-inter text-dark-muted">
                                    You can also paste public Google Drive image links.
                                </p>
                            </div>
                            {galleryPreviews.length > 0 && (
                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                    {galleryPreviews.map((src, index) => (
                                        <div key={`${src}-${index}`}>
                                            {renderImagePreview(
                                                src,
                                                `Saved gallery image ${index + 1}`
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Location Image URLs (newline or comma separated)
                            </label>
                            <textarea
                                value={form.locationImages}
                                onChange={(e) => update("locationImages", e.target.value)}
                                rows={3}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                            />
                            {renderFieldError("locationImages")}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                    {uploadingLocation ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Upload className="w-3.5 h-3.5" />
                                    )}
                                    Upload Location Images
                                    <input
                                        type="file"
                                        accept="image/*"
                                        multiple
                                        className="hidden"
                                        onChange={handleLocationUpload}
                                        disabled={uploadingLocation || saving}
                                    />
                                </label>
                            </div>
                            {locationPreviews.length > 0 && (
                                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                                    {locationPreviews.map((src, index) => (
                                        <div key={`${src}-${index}`}>
                                            {renderImagePreview(
                                                src,
                                                `Saved location image ${index + 1}`
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                Video URL (optional)
                            </label>
                            <input
                                type="text"
                                inputMode="url"
                                value={form.videoUrl}
                                onChange={(e) => update("videoUrl", e.target.value)}
                                className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                placeholder="https://youtube.com/..."
                            />
                            {renderFieldError("videoUrl")}
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                    {uploadingVideo ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Upload className="w-3.5 h-3.5" />
                                    )}
                                    Upload Video From Device
                                    <input
                                        type="file"
                                        accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                                        className="hidden"
                                        onChange={handleVideoUpload}
                                        disabled={uploadingVideo || saving}
                                    />
                                </label>
                                <p className="text-xs font-inter text-dark-muted">
                                    MP4, WebM or MOV (up to 50MB).
                                </p>
                            </div>

                            <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3">
                                <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                    Workshop Links
                                </h2>
                                <p className="mt-1 text-xs font-inter text-dark-muted">
                                    Optional social and website links for the workshop page.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Instagram Link
                                </label>
                                <input
                                    type="text"
                                    inputMode="url"
                                    value={form.instagramLink}
                                    onChange={(e) => update("instagramLink", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    placeholder="https://instagram.com/..."
                                />
                                {renderFieldError("instagramLink")}
                            </div>

                            <div>
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    YouTube Link
                                </label>
                                <input
                                    type="text"
                                    inputMode="url"
                                    value={form.youtubeLink}
                                    onChange={(e) => update("youtubeLink", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    placeholder="https://youtube.com/..."
                                />
                                {renderFieldError("youtubeLink")}
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Website Link
                                </label>
                                <input
                                    type="text"
                                    inputMode="url"
                                    value={form.websiteLink}
                                    onChange={(e) => update("websiteLink", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    placeholder="https://yourwebsite.com"
                                />
                                {renderFieldError("websiteLink")}
                            </div>

                            <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3">
                                <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                    Early Bird Offer
                                </h2>
                                <p className="mt-1 text-xs font-inter text-dark-muted">
                                    Offer a discount for users who book within X days of workshop
                                    listing.
                                </p>
                            </div>

                            <div className="md:col-span-2">
                                <label className="flex items-center gap-3 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={form.earlyBirdEnabled === "true"}
                                        onChange={(e) =>
                                            update(
                                                "earlyBirdEnabled",
                                                e.target.checked ? "true" : "false"
                                            )
                                        }
                                        className="w-4 h-4 rounded border-gray-300 text-terracotta focus:ring-terracotta"
                                    />
                                    <span className="text-sm font-inter font-semibold text-dark">
                                        Enable Early Bird Offer
                                    </span>
                                </label>
                                {renderFieldError("earlyBirdEnabled")}
                            </div>

                            {form.earlyBirdEnabled === "true" && (
                                <>
                                    <div>
                                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                            Discount Type
                                        </label>
                                        <select
                                            value={form.earlyBirdDiscountType}
                                            onChange={(e) =>
                                                update("earlyBirdDiscountType", e.target.value)
                                            }
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                        >
                                            <option value="percentage">Percentage (%)</option>
                                            <option value="fixed">Fixed Amount (₹)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                            Discount Value
                                        </label>
                                        <input
                                            type="number"
                                            value={form.earlyBirdDiscountValue}
                                            onChange={(e) =>
                                                update("earlyBirdDiscountValue", e.target.value)
                                            }
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                            placeholder={
                                                form.earlyBirdDiscountType === "percentage"
                                                    ? "e.g. 10"
                                                    : "e.g. 200"
                                            }
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                            Valid For (Days After Listing)
                                        </label>
                                        <input
                                            type="number"
                                            value={form.earlyBirdDaysAfterListing}
                                            onChange={(e) =>
                                                update("earlyBirdDaysAfterListing", e.target.value)
                                            }
                                            className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                            placeholder="e.g. 1"
                                        />
                                    </div>
                                </>
                            )}

                            <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3">
                                <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                    Host & Story
                                </h2>
                                <p className="mt-1 text-xs font-inter text-dark-muted">
                                    Profile copy shown in workshop detail pages.
                                </p>
                            </div>

                            <div>
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Host Name
                                </label>
                                <input
                                    value={form.hostName}
                                    onChange={(e) => update("hostName", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    required
                                />
                                {renderFieldError("hostName")}
                            </div>

                            <div>
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Host Experience
                                </label>
                                <input
                                    value={form.hostExperience}
                                    onChange={(e) => update("hostExperience", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                />
                                {renderFieldError("hostExperience")}
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Host Bio
                                </label>
                                <textarea
                                    value={form.hostBio}
                                    onChange={(e) => update("hostBio", e.target.value)}
                                    rows={3}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    required
                                />
                                {renderFieldError("hostBio")}
                            </div>

                            <div>
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Host Instagram
                                </label>
                                <input
                                    type="text"
                                    inputMode="url"
                                    value={form.hostInstagram}
                                    onChange={(e) => update("hostInstagram", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    placeholder="https://instagram.com/..."
                                />
                                {renderFieldError("hostInstagram")}
                            </div>

                            <div>
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Host YouTube
                                </label>
                                <input
                                    type="text"
                                    inputMode="url"
                                    value={form.hostYoutube}
                                    onChange={(e) => update("hostYoutube", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    placeholder="https://youtube.com/..."
                                />
                                {renderFieldError("hostYoutube")}
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Host Website
                                </label>
                                <input
                                    type="text"
                                    inputMode="url"
                                    value={form.hostWebsite}
                                    onChange={(e) => update("hostWebsite", e.target.value)}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    placeholder="https://hostwebsite.com"
                                />
                                {renderFieldError("hostWebsite")}
                            </div>

                            <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3">
                                <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                    Curriculum
                                </h2>
                                <p className="mt-1 text-xs font-inter text-dark-muted">
                                    Teaching outcomes and included materials.
                                </p>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    What You Learn (newline or comma separated)
                                </label>
                                <textarea
                                    value={form.whatYouLearn}
                                    onChange={(e) => update("whatYouLearn", e.target.value)}
                                    rows={3}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    required
                                />
                                {renderFieldError("whatYouLearn")}
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Materials Provided (newline or comma separated)
                                </label>
                                <textarea
                                    value={form.materialsProvided}
                                    onChange={(e) => update("materialsProvided", e.target.value)}
                                    rows={3}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    required
                                />
                                {renderFieldError("materialsProvided")}
                            </div>

                            <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3">
                                <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                                    Badges
                                </h2>
                                <p className="mt-1 text-xs font-inter text-dark-muted">
                                    Labels shown on workshop cards and detail pages.
                                </p>
                            </div>

                            <div className="md:col-span-2">
                                <label className="block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                                    Badge Labels (newline or comma separated)
                                </label>
                                <textarea
                                    value={form.badgeLabels}
                                    onChange={(e) => update("badgeLabels", e.target.value)}
                                    rows={3}
                                    className="w-full bg-cream-100 border border-gray-200 rounded-xl px-4 py-3 text-sm font-inter"
                                    placeholder={
                                        "Beginners welcome\nAll materials included\nCity · Offline workshop"
                                    }
                                />
                                {renderFieldError("badgeLabels")}
                            </div>
                        </div>
                    </div>

                    {error && <p className="text-sm font-inter text-red-600">{error}</p>}
                    {saved && (
                        <p className="text-sm font-inter text-emerald-700 inline-flex items-center gap-1.5">
                            <Check className="w-4 h-4" />
                            Workshop updated.
                        </p>
                    )}

                    <div className="flex gap-3">
                        <Link href="/admin/workshops" className="btn-secondary">
                            Cancel
                        </Link>
                        <button
                            type="submit"
                            disabled={saving}
                            className="btn-primary disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                "Save Changes"
                            )}
                        </button>
                    </div>
                </form>
            )}
        </AdminShell>
    );
}
