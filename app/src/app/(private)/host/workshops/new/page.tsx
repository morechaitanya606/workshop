"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Upload, X } from "lucide-react";
import HostShell from "@/components/host/HostShell";
import { useAuth } from "@/lib/auth-context";
import { categories, PAST_EVENTS_CATEGORY_ID } from "@/lib/data";
import { createHostWorkshop, toApiErrorMessage, uploadMedia } from "@/lib/api-client";
import { workshopCreateSchema } from "@/lib/validators";
import { useImageCropper } from "@/components/ImageCropper";

function toList(value: string) {
    return value
        .split(/\r?\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
}

type CreateWorkshopForm = {
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

type FieldErrors = Partial<Record<keyof CreateWorkshopForm, string>>;

const FIELD_VALIDATION_MESSAGES: Partial<Record<keyof CreateWorkshopForm, string>> = {
    title: "Title must be at least 3 characters.",
    description: "Description must be at least 20 characters.",
    category: "Choose a category or enter a custom category.",
    price: "Price must be a whole number greater than 0.",
    location: "Location must be at least 2 characters.",
    city: "City must be at least 2 characters.",
    duration: "Duration is required.",
    date: "Date is required.",
    time: "Time is required.",
    maxSeats: "Max seats must be a whole number between 1 and 500.",
    coverImage: "Cover image is required. Upload an image or paste a valid image URL.",
    galleryImages: "Each gallery image must be a valid image URL.",
    videoUrl: "Video URL must be a valid URL.",
    instagramLink: "Instagram link must be a valid URL.",
    youtubeLink: "YouTube link must be a valid URL.",
    websiteLink: "Website link must be a valid URL.",
    hostName: "Host name must be at least 2 characters.",
    hostBio: "Host bio must be at least 10 characters.",
    hostInstagram: "Host Instagram link must be a valid URL.",
    hostYoutube: "Host YouTube link must be a valid URL.",
    hostWebsite: "Host website link must be a valid URL.",
    whatYouLearn: "Add at least one learning outcome.",
    materialsProvided: "Add at least one provided material.",
    badgeLabels: "Each badge label must be under 120 characters.",
    latitude: "Latitude must be between -90 and 90.",
    longitude: "Longitude must be between -180 and 180.",
    locationImages: "Each location image must be a valid image URL.",
    earlyBirdDiscountValue: "Discount value must be a whole number.",
    earlyBirdDaysAfterListing: "Valid days must be a whole number.",
};

function getFieldValidationMessage(field: keyof CreateWorkshopForm, message: string) {
    if (message.toLowerCase().includes("url")) {
        return message;
    }

    return FIELD_VALIDATION_MESSAGES[field] || message || "Please enter a valid value.";
}

function SectionHeader(props: { title: string; description: string }) {
    return (
        <div className="md:col-span-2 border-b border-gray-100 pb-3 pt-3 first:pt-0">
            <h2 className="text-sm font-inter font-bold uppercase tracking-wider text-terracotta">
                {props.title}
            </h2>
            <p className="mt-1 text-xs font-inter text-dark-muted">{props.description}</p>
        </div>
    );
}

function FieldError(props: { error?: string }) {
    if (!props.error) return null;
    return <p className="mt-1 text-xs font-inter text-red-600">{props.error}</p>;
}

function UploadButton(props: {
    busy: boolean;
    disabled: boolean;
    label: string;
    accept: string;
    multiple?: boolean;
    onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-inter font-semibold text-dark transition-colors hover:border-terracotta hover:text-terracotta">
            {props.busy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
                <Upload className="h-3.5 w-3.5" />
            )}
            {props.label}
            <input
                type="file"
                accept={props.accept}
                multiple={props.multiple}
                className="hidden"
                onChange={props.onChange}
                disabled={props.busy || props.disabled}
            />
        </label>
    );
}

export default function HostCreateWorkshopPage() {
    const router = useRouter();
    const { session } = useAuth();
    const categoryOptions = categories.filter(
        (item) => item.id !== "trending" && item.id !== PAST_EVENTS_CATEGORY_ID
    );

    const [saving, setSaving] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);
    const [uploadingGallery, setUploadingGallery] = useState(false);
    const [uploadingVideo, setUploadingVideo] = useState(false);
    const [uploadingLocation, setUploadingLocation] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
    const [categorySelection, setCategorySelection] = useState("");
    const [customCategory, setCustomCategory] = useState("");
    const [form, setForm] = useState<CreateWorkshopForm>({
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

    const update = (field: keyof CreateWorkshopForm, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setFieldErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    };

    const { cropImages, cropperElement } = useImageCropper();

    const uploadOneFile = async (file: File) => {
        if (!session?.access_token) throw new Error("Your session expired. Please log in again.");
        const result = await uploadMedia(session.access_token, file, { crop: "5:4" });
        return String(result.url || "");
    };

    const mergeUploadedUrls = async (
        field: "galleryImages" | "locationImages",
        files: File[],
        setBusy: (value: boolean) => void
    ) => {
        if (!files.length) return;
        setBusy(true);
        setError(null);
        try {
            const urls = await Promise.all(files.map((file) => uploadOneFile(file)));
            update(field, Array.from(new Set([...toList(form[field]), ...urls])).join("\n"));
        } catch (uploadError) {
            setError(toApiErrorMessage(uploadError, "Unable to upload files."));
        } finally {
            setBusy(false);
        }
    };

    const handleSubmit = async (event: FormEvent) => {
        event.preventDefault();
        if (!session?.access_token) return;

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
            eventAddress: form.eventAddress.trim() || undefined,
            latitude: form.latitude.trim() ? Number(form.latitude) : undefined,
            longitude: form.longitude.trim() ? Number(form.longitude) : undefined,
            locationImages: toList(form.locationImages),
            earlyBirdEnabled: form.earlyBirdEnabled === "true",
            earlyBirdDiscountType: form.earlyBirdDiscountType === "fixed" ? "fixed" : "percentage",
            earlyBirdDiscountValue: form.earlyBirdDiscountValue
                ? Number(form.earlyBirdDiscountValue)
                : 0,
            earlyBirdDaysAfterListing: form.earlyBirdDaysAfterListing
                ? Number(form.earlyBirdDaysAfterListing)
                : 0,
        };

        const validation = workshopCreateSchema.safeParse(payload);
        if (!validation.success) {
            const nextErrors: FieldErrors = {};
            for (const issue of validation.error.issues) {
                const [root, nested] = issue.path;
                let field: keyof CreateWorkshopForm | null = null;
                if (root === "socialLinks")
                    field =
                        nested === "instagram"
                            ? "instagramLink"
                            : nested === "youtube"
                              ? "youtubeLink"
                              : nested === "website"
                                ? "websiteLink"
                                : null;
                if (root === "hostSocialLinks")
                    field =
                        nested === "instagram"
                            ? "hostInstagram"
                            : nested === "youtube"
                              ? "hostYoutube"
                              : nested === "website"
                                ? "hostWebsite"
                                : null;
                if (!field && typeof root === "string" && root in form)
                    field = root as keyof CreateWorkshopForm;
                if (field && !nextErrors[field]) {
                    nextErrors[field] = getFieldValidationMessage(field, issue.message);
                }
            }
            setFieldErrors(nextErrors);
            setError("Please fix the highlighted fields and try again.");
            return;
        }

        setSaving(true);
        setError(null);
        setFieldErrors({});
        try {
            await createHostWorkshop(session.access_token, validation.data);
            router.push("/host/workshops");
        } catch (submitError) {
            setError(toApiErrorMessage(submitError, "Unable to submit workshop."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <HostShell>
            {cropperElement}
            <div className="mb-8 flex items-center gap-3">
                <Link href="/host/workshops" className="btn-secondary !py-2 !px-3">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <div>
                    <p className="text-xs font-inter font-bold uppercase tracking-wider text-terracotta mb-1">
                        Host
                    </p>
                    <h1 className="heading-md">Submit Workshop</h1>
                    <p className="mt-1 text-body text-dark-muted">
                        Your workshop will stay pending until an admin reviews and approves it.
                    </p>
                </div>
            </div>

            <form
                onSubmit={handleSubmit}
                className="space-y-5 rounded-2xl bg-white p-6 shadow-soft"
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <SectionHeader
                        title="Basics"
                        description="Main workshop details shown across the site."
                    />
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Title
                        </label>
                        <input
                            value={form.title}
                            onChange={(e) => update("title", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.title} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Description
                        </label>
                        <textarea
                            value={form.description}
                            onChange={(e) => update("description", e.target.value)}
                            rows={4}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.description} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Category
                        </label>
                        <select
                            value={categorySelection}
                            onChange={(e) => {
                                setCategorySelection(e.target.value);
                                update(
                                    "category",
                                    e.target.value === "__other__" ? customCategory : e.target.value
                                );
                            }}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
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
                            <input
                                value={customCategory}
                                onChange={(e) => {
                                    setCustomCategory(e.target.value);
                                    update("category", e.target.value);
                                }}
                                className="mt-3 w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                                placeholder="e.g. Calligraphy"
                                required
                            />
                        )}
                        <FieldError error={fieldErrors.category} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Price
                        </label>
                        <input
                            type="number"
                            value={form.price}
                            onChange={(e) => update("price", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.price} />
                    </div>

                    <SectionHeader
                        title="Schedule & Venue"
                        description="Date, timing, location, and capacity."
                    />
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Location
                        </label>
                        <input
                            value={form.location}
                            onChange={(e) => update("location", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.location} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            City
                        </label>
                        <input
                            value={form.city}
                            onChange={(e) => update("city", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.city} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Event Address
                        </label>
                        <textarea
                            value={form.eventAddress}
                            onChange={(e) => update("eventAddress", e.target.value)}
                            rows={2}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.eventAddress} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Latitude
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={form.latitude}
                            onChange={(e) => update("latitude", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.latitude} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Longitude
                        </label>
                        <input
                            type="number"
                            step="any"
                            value={form.longitude}
                            onChange={(e) => update("longitude", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.longitude} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Date
                        </label>
                        <input
                            type="date"
                            value={form.date}
                            onChange={(e) => update("date", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.date} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Time
                        </label>
                        <input
                            type="time"
                            value={form.time}
                            onChange={(e) => update("time", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.time} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Duration
                        </label>
                        <input
                            value={form.duration}
                            onChange={(e) => update("duration", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.duration} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Max Seats
                        </label>
                        <input
                            type="number"
                            value={form.maxSeats}
                            onChange={(e) => update("maxSeats", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.maxSeats} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Location Images (newline or comma separated)
                        </label>
                        <textarea
                            value={form.locationImages}
                            onChange={(e) => update("locationImages", e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.locationImages} />
                        <div className="mt-2">
                            <UploadButton
                                busy={uploadingLocation}
                                disabled={saving}
                                label="Upload Venue Images"
                                accept="image/*"
                                multiple
                                onChange={(e) => {
                                    const files = Array.from(e.target.files || []);
                                    e.target.value = "";
                                    void mergeUploadedUrls(
                                        "locationImages",
                                        files,
                                        setUploadingLocation
                                    );
                                }}
                            />
                        </div>
                    </div>

                    <SectionHeader
                        title="Media & Links"
                        description="Upload visuals and add optional workshop links."
                    />
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Cover Image
                        </label>
                        <input
                            value={form.coverImage}
                            onChange={(e) => update("coverImage", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.coverImage} />
                        <div className="mt-2">
                            <UploadButton
                                busy={uploadingCover}
                                disabled={saving}
                                label="Upload Cover Image"
                                accept="image/*"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (!file) return;
                                    const [cropped] = await cropImages([file]);
                                    if (!cropped) return;
                                    setUploadingCover(true);
                                    setError(null);
                                    try {
                                        update("coverImage", await uploadOneFile(cropped));
                                    } catch (uploadError) {
                                        setError(
                                            toApiErrorMessage(
                                                uploadError,
                                                "Unable to upload cover image."
                                            )
                                        );
                                    } finally {
                                        setUploadingCover(false);
                                    }
                                }}
                            />
                        </div>
                        {form.coverImage.trim() && (
                            <div className="mt-3">
                                <p className="mb-1.5 text-[11px] font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                    Preview (5:4)
                                </p>
                                <div className="relative w-full max-w-xs overflow-hidden rounded-xl border border-gray-200 bg-cream-100 aspect-[5/4]">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={form.coverImage.trim()}
                                        alt="Cover image preview"
                                        className="absolute inset-0 h-full w-full object-cover"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => update("coverImage", "")}
                                        className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                                        aria-label="Remove cover image"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Gallery Images (newline or comma separated)
                        </label>
                        <textarea
                            value={form.galleryImages}
                            onChange={(e) => update("galleryImages", e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.galleryImages} />
                        <div className="mt-2">
                            <UploadButton
                                busy={uploadingGallery}
                                disabled={saving}
                                label="Upload Gallery Images"
                                accept="image/*"
                                multiple
                                onChange={async (e) => {
                                    const files = Array.from(e.target.files || []);
                                    e.target.value = "";
                                    const cropped = await cropImages(files);
                                    if (!cropped.length) return;
                                    void mergeUploadedUrls(
                                        "galleryImages",
                                        cropped,
                                        setUploadingGallery
                                    );
                                }}
                            />
                        </div>
                        {toList(form.galleryImages).length > 0 && (
                            <div className="mt-3">
                                <p className="mb-1.5 text-[11px] font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                    Preview (5:4)
                                </p>
                                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                                    {toList(form.galleryImages).map((url) => (
                                        <div
                                            key={url}
                                            className="relative overflow-hidden rounded-xl border border-gray-200 bg-cream-100 aspect-[5/4]"
                                        >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={url}
                                                alt="Gallery image preview"
                                                className="absolute inset-0 h-full w-full object-cover"
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    update(
                                                        "galleryImages",
                                                        toList(form.galleryImages)
                                                            .filter((item) => item !== url)
                                                            .join("\n")
                                                    )
                                                }
                                                className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                                                aria-label="Remove gallery image"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Video URL
                        </label>
                        <input
                            value={form.videoUrl}
                            onChange={(e) => update("videoUrl", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.videoUrl} />
                        <div className="mt-2">
                            <UploadButton
                                busy={uploadingVideo}
                                disabled={saving}
                                label="Upload Video"
                                accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                                onChange={async (e) => {
                                    const file = e.target.files?.[0];
                                    e.target.value = "";
                                    if (!file) return;
                                    setUploadingVideo(true);
                                    setError(null);
                                    try {
                                        update("videoUrl", await uploadOneFile(file));
                                    } catch (uploadError) {
                                        setError(
                                            toApiErrorMessage(
                                                uploadError,
                                                "Unable to upload video."
                                            )
                                        );
                                    } finally {
                                        setUploadingVideo(false);
                                    }
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Instagram Link
                        </label>
                        <input
                            value={form.instagramLink}
                            onChange={(e) => update("instagramLink", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.instagramLink} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            YouTube Link
                        </label>
                        <input
                            value={form.youtubeLink}
                            onChange={(e) => update("youtubeLink", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.youtubeLink} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Website Link
                        </label>
                        <input
                            value={form.websiteLink}
                            onChange={(e) => update("websiteLink", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.websiteLink} />
                    </div>

                    <SectionHeader
                        title="Early Bird Offer"
                        description="Optional launch discount after listing."
                    />
                    <div className="md:col-span-2">
                        <label className="flex cursor-pointer items-center gap-3">
                            <input
                                type="checkbox"
                                checked={form.earlyBirdEnabled === "true"}
                                onChange={(e) =>
                                    update("earlyBirdEnabled", e.target.checked ? "true" : "false")
                                }
                                className="h-4 w-4 rounded border-gray-300 text-terracotta focus:ring-terracotta"
                            />
                            <span className="text-sm font-inter font-semibold text-dark">
                                Enable Early Bird Offer
                            </span>
                        </label>
                    </div>
                    {form.earlyBirdEnabled === "true" && (
                        <>
                            <div>
                                <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Discount Type
                                </label>
                                <select
                                    value={form.earlyBirdDiscountType}
                                    onChange={(e) =>
                                        update("earlyBirdDiscountType", e.target.value)
                                    }
                                    className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                                >
                                    <option value="percentage">Percentage (%)</option>
                                    <option value="fixed">Fixed Amount (Rs.)</option>
                                </select>
                                <FieldError error={fieldErrors.earlyBirdDiscountType} />
                            </div>
                            <div>
                                <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Discount Value
                                </label>
                                <input
                                    type="number"
                                    value={form.earlyBirdDiscountValue}
                                    onChange={(e) =>
                                        update("earlyBirdDiscountValue", e.target.value)
                                    }
                                    className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                                />
                                <FieldError error={fieldErrors.earlyBirdDiscountValue} />
                            </div>
                            <div className="md:col-span-2">
                                <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                                    Valid For (Days After Listing)
                                </label>
                                <input
                                    type="number"
                                    value={form.earlyBirdDaysAfterListing}
                                    onChange={(e) =>
                                        update("earlyBirdDaysAfterListing", e.target.value)
                                    }
                                    className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                                />
                                <FieldError error={fieldErrors.earlyBirdDaysAfterListing} />
                            </div>
                        </>
                    )}

                    <SectionHeader
                        title="Host & Story"
                        description="Tell attendees who is leading the workshop."
                    />
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Host Name
                        </label>
                        <input
                            value={form.hostName}
                            onChange={(e) => update("hostName", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.hostName} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Host Experience
                        </label>
                        <input
                            value={form.hostExperience}
                            onChange={(e) => update("hostExperience", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.hostExperience} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Host Bio
                        </label>
                        <textarea
                            value={form.hostBio}
                            onChange={(e) => update("hostBio", e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.hostBio} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Host Instagram
                        </label>
                        <input
                            value={form.hostInstagram}
                            onChange={(e) => update("hostInstagram", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.hostInstagram} />
                    </div>
                    <div>
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Host YouTube
                        </label>
                        <input
                            value={form.hostYoutube}
                            onChange={(e) => update("hostYoutube", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.hostYoutube} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Host Website
                        </label>
                        <input
                            value={form.hostWebsite}
                            onChange={(e) => update("hostWebsite", e.target.value)}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.hostWebsite} />
                    </div>

                    <SectionHeader
                        title="Curriculum"
                        description="Add learning outcomes, materials, and badge text."
                    />
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            What You Learn (newline or comma separated)
                        </label>
                        <textarea
                            value={form.whatYouLearn}
                            onChange={(e) => update("whatYouLearn", e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.whatYouLearn} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Materials Provided (newline or comma separated)
                        </label>
                        <textarea
                            value={form.materialsProvided}
                            onChange={(e) => update("materialsProvided", e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                            required
                        />
                        <FieldError error={fieldErrors.materialsProvided} />
                    </div>
                    <div className="md:col-span-2">
                        <label className="mb-2 block text-xs font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Badge Labels (newline or comma separated)
                        </label>
                        <textarea
                            value={form.badgeLabels}
                            onChange={(e) => update("badgeLabels", e.target.value)}
                            rows={3}
                            className="w-full rounded-xl border border-gray-200 bg-cream-100 px-4 py-3 text-sm font-inter"
                        />
                        <FieldError error={fieldErrors.badgeLabels} />
                    </div>
                </div>

                {error && <p className="text-sm font-inter text-red-600">{error}</p>}

                <div className="flex flex-wrap gap-3">
                    <Link href="/host/workshops" className="btn-secondary">
                        Cancel
                    </Link>
                    <button
                        type="submit"
                        disabled={saving}
                        className="btn-primary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {saving ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Submitting...
                            </>
                        ) : (
                            "Submit for Approval"
                        )}
                    </button>
                </div>
            </form>
        </HostShell>
    );
}
