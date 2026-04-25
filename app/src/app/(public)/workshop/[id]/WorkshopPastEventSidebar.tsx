"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { BellRing, Star, X } from "lucide-react";
import { slideInRight, standardTransition } from "@/lib/motion-presets";
import { formatDate } from "@/lib/utils";
import type { ChangeEvent } from "react";

interface UserFeedback {
    rating: number | null;
    comment: string;
    photos: string[];
    video_url: string | null;
    created_at: string;
    updated_at: string;
}

export interface WorkshopPastEventSidebarProps {
    workshopDate: string;
    formattedWorkshopTime: string;
    workshopLocation: string;
    workshopCity: string;
    workshopRating: number;
    workshopReviewCount: number;
    feedbackHighlight?: string;
    feedbackAuthor?: string;

    notifyState: { similar: boolean; creator: boolean };
    notifyLoadingMode: "similar" | "creator" | null;
    notifyMessage: string | null;
    notifyError: string | null;
    onPastNotify: (mode: "similar" | "creator") => void;

    userFeedback: UserFeedback | null;
    isEditingFeedback: boolean;
    canLeaveFeedback: boolean;
    feedbackDraft: string;
    setFeedbackDraft: (draft: string) => void;
    feedbackRating: number;
    setFeedbackRating: (rating: number) => void;
    feedbackPhotos: string[];
    feedbackUploading: boolean;
    feedbackLoading: boolean;
    feedbackError: string | null;
    feedbackMessage: string | null;
    maxFeedbackPhotos: number;
    onStartFeedbackEdit: () => void;
    onCancelFeedbackEdit: () => void;
    onFeedbackSubmit: () => void;
    onFeedbackPhotoUpload: (event: ChangeEvent<HTMLInputElement>) => void;
    onRemoveFeedbackPhoto: (index: number) => void;
}

export default function WorkshopPastEventSidebar({
    workshopDate,
    formattedWorkshopTime,
    workshopLocation,
    workshopCity,
    workshopRating,
    workshopReviewCount,
    feedbackHighlight,
    feedbackAuthor,

    notifyState,
    notifyLoadingMode,
    notifyMessage,
    notifyError,
    onPastNotify,

    userFeedback,
    isEditingFeedback,
    canLeaveFeedback,
    feedbackDraft,
    setFeedbackDraft,
    feedbackRating,
    setFeedbackRating,
    feedbackPhotos,
    feedbackUploading,
    feedbackLoading,
    feedbackError,
    feedbackMessage,
    maxFeedbackPhotos,
    onStartFeedbackEdit,
    onCancelFeedbackEdit,
    onFeedbackSubmit,
    onFeedbackPhotoUpload,
    onRemoveFeedbackPhoto,
}: WorkshopPastEventSidebarProps) {
    const prefersReducedMotion = useReducedMotion();

    return (
        <motion.div
            variants={prefersReducedMotion ? undefined : slideInRight}
            initial={prefersReducedMotion ? undefined : "hidden"}
            animate={prefersReducedMotion ? undefined : "visible"}
            transition={
                prefersReducedMotion ? { duration: 0 } : { ...standardTransition, delay: 0.3 }
            }
            className="min-[900px]:sticky min-[900px]:top-28 min-[900px]:max-h-[calc(100vh-8rem)] min-[900px]:overflow-y-auto bg-white rounded-2xl shadow-card p-6 border border-clay/50"
        >
            <div className="inline-flex items-center gap-2 bg-terracotta/10 text-terracotta text-xs font-inter font-bold uppercase tracking-wider px-3 py-1.5 rounded-full mb-4">
                Past Event
            </div>
            <p className="text-sm font-inter text-dark-muted mb-5">
                {formatDate(workshopDate)} &bull; {formattedWorkshopTime} &bull; {workshopLocation},{" "}
                {workshopCity}
            </p>

            <div className="bg-cream-100 rounded-2xl p-4 border border-clay/40 mb-5">
                <p className="text-[11px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                    Attendee Feedback
                </p>
                <p className="text-sm font-inter text-dark-secondary leading-relaxed">
                    &ldquo;
                    {feedbackHighlight ||
                        `Rated ${workshopRating}/5 from ${workshopReviewCount} reviews.`}
                    &rdquo;
                </p>
                <p className="text-xs font-inter text-dark-muted mt-2">
                    {feedbackAuthor || `${workshopReviewCount} verified reviews`}
                </p>
            </div>

            <div className="space-y-3">
                <button
                    onClick={() => onPastNotify("similar")}
                    disabled={notifyLoadingMode !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.similar ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-terracotta text-white hover:bg-terracotta-600"}`}
                >
                    <BellRing className="w-4 h-4" />
                    {notifyLoadingMode === "similar"
                        ? "Saving..."
                        : notifyState.similar
                          ? "Similar Event Alerts On"
                          : "Notify Similar Event"}
                </button>
                <button
                    onClick={() => onPastNotify("creator")}
                    disabled={notifyLoadingMode !== null}
                    className={`w-full inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-inter font-semibold transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${notifyState.creator ? "bg-emerald-100 text-emerald-700 border border-emerald-300" : "bg-white text-dark-secondary border border-gray-200 hover:border-terracotta hover:text-terracotta"}`}
                >
                    <BellRing className="w-4 h-4" />
                    {notifyLoadingMode === "creator"
                        ? "Saving..."
                        : notifyState.creator
                          ? "Creator Alerts On"
                          : "Notify Creator Event"}
                </button>
            </div>
            {notifyMessage && (
                <p className="mt-4 text-xs font-inter text-emerald-700">{notifyMessage}</p>
            )}
            {notifyError && <p className="mt-2 text-xs font-inter text-red-600">{notifyError}</p>}

            {/* ── Existing user feedback (read-only view) ── */}
            {userFeedback && !isEditingFeedback && (
                <div className="mt-6 pt-5 border-t border-dashed border-clay/50">
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted">
                            Your Feedback
                        </p>
                        <button
                            type="button"
                            onClick={onStartFeedbackEdit}
                            className="text-xs font-inter font-semibold text-terracotta hover:text-terracotta-700 transition-colors"
                        >
                            Edit
                        </button>
                    </div>
                    <div className="flex items-center gap-1">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <Star
                                key={index}
                                className={`w-4 h-4 ${
                                    index < (userFeedback.rating ?? 0)
                                        ? "text-terracotta fill-terracotta"
                                        : "text-dark-muted/40"
                                }`}
                            />
                        ))}
                        <span className="text-xs font-inter text-dark-muted ml-2">
                            {userFeedback.rating ?? "—"} / 5
                        </span>
                    </div>
                    <p className="mt-2 text-sm font-inter text-dark-secondary leading-relaxed">
                        {userFeedback.comment}
                    </p>
                    {userFeedback.photos?.length > 0 && (
                        <div className="mt-3 grid grid-cols-3 gap-2">
                            {userFeedback.photos.map((photo, index) => (
                                <div
                                    key={`${photo}-${index}`}
                                    className="relative aspect-square overflow-hidden rounded-lg bg-cream-100 border border-clay/30"
                                >
                                    <Image
                                        src={photo}
                                        alt="Your workshop feedback"
                                        fill
                                        className="object-cover"
                                        sizes="96px"
                                    />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ── Feedback form (new or editing) ── */}
            {canLeaveFeedback && (isEditingFeedback || !userFeedback) && (
                <div className="mt-6 pt-5 border-t border-dashed border-clay/50">
                    <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                        Rate this workshop
                    </label>
                    <div className="flex items-center gap-1 mb-3">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <button
                                key={index}
                                type="button"
                                onClick={() => setFeedbackRating(index + 1)}
                                className="p-1"
                                aria-label={`Rate ${index + 1} stars`}
                            >
                                <Star
                                    className={`w-4 h-4 ${
                                        index < feedbackRating
                                            ? "text-terracotta fill-terracotta"
                                            : "text-dark-muted/40"
                                    }`}
                                />
                            </button>
                        ))}
                        <span className="text-xs font-inter text-dark-muted ml-2">
                            {feedbackRating} / 5
                        </span>
                    </div>
                    <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                        Feedback
                    </label>
                    <textarea
                        value={feedbackDraft}
                        onChange={(event) => setFeedbackDraft(event.target.value)}
                        rows={4}
                        placeholder="Share your feedback for this workshop"
                        className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-inter text-dark focus:outline-none focus:ring-2 focus:ring-terracotta/30 focus:border-terracotta/50"
                    />
                    <div className="mt-3">
                        <label className="block text-[10px] font-inter font-bold uppercase tracking-wider text-dark-muted mb-2">
                            Upload photos
                        </label>
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="inline-flex items-center gap-2 rounded-full border border-clay/40 px-3 py-2 text-xs font-inter font-semibold text-dark-secondary cursor-pointer hover:border-terracotta hover:text-terracotta transition-colors">
                                <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={onFeedbackPhotoUpload}
                                    disabled={feedbackUploading || feedbackLoading}
                                    className="sr-only"
                                />
                                {feedbackUploading ? "Uploading..." : "Add photos"}
                            </label>
                            <span className="text-xs font-inter text-dark-muted">
                                {feedbackPhotos.length}/{maxFeedbackPhotos}
                            </span>
                        </div>
                        {feedbackPhotos.length > 0 && (
                            <div className="mt-3 grid grid-cols-3 gap-2">
                                {feedbackPhotos.map((photo, index) => (
                                    <div
                                        key={`${photo}-${index}`}
                                        className="relative aspect-square overflow-hidden rounded-lg bg-cream-100 border border-clay/30"
                                    >
                                        <Image
                                            src={photo}
                                            alt="Uploaded feedback"
                                            fill
                                            className="object-cover"
                                            sizes="96px"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => onRemoveFeedbackPhoto(index)}
                                            className="absolute top-1 right-1 rounded-full bg-white/90 p-1 shadow-sm"
                                            aria-label="Remove photo"
                                        >
                                            <X className="w-3 h-3 text-dark-muted" />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="mt-4 flex items-center gap-3">
                        <button
                            onClick={onFeedbackSubmit}
                            disabled={feedbackLoading}
                            className="flex-1 rounded-full border border-terracotta text-terracotta font-inter font-semibold text-sm px-4 py-2.5 hover:bg-terracotta hover:text-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {feedbackLoading ? "Submitting..." : "Submit Feedback"}
                        </button>
                        {userFeedback && isEditingFeedback && (
                            <button
                                type="button"
                                onClick={onCancelFeedbackEdit}
                                className="rounded-full border border-gray-200 px-4 py-2.5 text-sm font-inter font-semibold text-dark-secondary hover:border-terracotta hover:text-terracotta transition-colors"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                    {feedbackError && (
                        <p className="mt-2 text-xs font-inter text-red-600">{feedbackError}</p>
                    )}
                    {feedbackMessage && (
                        <p className="mt-2 text-xs font-inter text-emerald-700">
                            {feedbackMessage}
                        </p>
                    )}
                </div>
            )}
        </motion.div>
    );
}
