"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, PencilLine, Plus, Tag, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { type CouponWorkshopOption } from "@/components/admin/CouponWorkshopPicker";
import OfferEditor from "@/components/admin/OfferEditor";
import {
    EMPTY_OFFER_FORM,
    enteredEndFromValidUntil,
    formatIst,
    formFromCoupon,
    isAdvertised,
    offerAppliesToWorkshop,
    visibilityLabel,
    type OfferPayload,
} from "@/components/admin/offer-form";
import {
    createAdminCoupon,
    deleteAdminCoupon,
    getAdminCoupons,
    getAdminWorkshops,
    toApiErrorMessage,
    updateAdminCoupon,
    type AdminCoupon,
} from "@/lib/api-client";
import { getIstTodayIso } from "@/lib/ist-date";
import { describeDiscount } from "@/lib/offers";

/** The list is read 100 at a time; more pages than this are not expected. */
const MAX_COUPON_PAGES = 10;

type Notice = { tone: "success" | "error" | "warning"; text: string } | null;

const VISIBILITY_BADGE: Record<string, string> = {
    hidden: "border-gray-200 bg-gray-50 text-dark-muted",
    listed: "border-blue-200 bg-blue-50 text-blue-800",
    auto: "border-emerald-200 bg-emerald-50 text-emerald-800",
    community: "border-amber-200 bg-amber-50 text-amber-800",
};

function NoticeBox({ notice }: { notice: Notice }) {
    if (!notice) return null;
    const tone =
        notice.tone === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
            : notice.tone === "warning"
              ? "border-amber-200 bg-amber-50 text-amber-800"
              : "border-red-200 bg-red-50 text-red-700";
    return (
        <p
            className={`rounded-xl border px-4 py-3 text-sm font-inter ${tone}`}
            role={notice.tone === "success" ? "status" : "alert"}
        >
            {notice.text}
        </p>
    );
}

type OffersManagerProps = {
    accessToken: string | null | undefined;
    /**
     * Set on a workshop's own page: only the offers that reach this workshop are listed, and a
     * new offer starts limited to it (the "Applies to" choice can still be changed). Without it
     * every offer is listed (Admin > Offers).
     */
    workshop?: { id: string; title: string } | null;
    /** Called after an offer was added, saved, switched or deleted. */
    onChange?: () => void;
};

/**
 * The offers list with its editor: add an offer, edit it, switch it on or off, delete it. Used by
 * Admin > Offers (every offer) and by each workshop's edit page (that workshop's offers), so an
 * offer is managed the same way in both places.
 */
export default function OffersManager({
    accessToken,
    workshop = null,
    onChange,
}: OffersManagerProps) {
    const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
    const [workshops, setWorkshops] = useState<CouponWorkshopOption[]>([]);
    const [offerSettingsOk, setOfferSettingsOk] = useState(true);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);
    const [notice, setNotice] = useState<Notice>(null);

    const [creating, setCreating] = useState(false);
    const [createKey, setCreateKey] = useState(0);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [savingId, setSavingId] = useState<string | null>(null);
    const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
    const [editorError, setEditorError] = useState<string | null>(null);
    const todayIso = useMemo(() => getIstTodayIso(), []);
    const workshopId = workshop?.id ?? null;
    const workshopTitleById = useMemo(
        () => new Map(workshops.map((item) => [item.id, item.title])),
        [workshops]
    );
    const newOfferForm = useMemo(
        () => (workshopId ? { ...EMPTY_OFFER_FORM, workshopIds: [workshopId] } : EMPTY_OFFER_FORM),
        [workshopId]
    );
    const listed = useMemo(
        () =>
            workshopId
                ? coupons.filter((coupon) => offerAppliesToWorkshop(coupon, workshopId))
                : coupons,
        [coupons, workshopId]
    );

    useEffect(() => {
        if (!accessToken) return;
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setLoadError(null);
            try {
                const [firstPage, workshopsResult] = await Promise.all([
                    getAdminCoupons(accessToken, { limit: 100 }),
                    // Only for the "Applies to" picker: a failure must not block the list.
                    getAdminWorkshops(accessToken).catch(() => ({ data: [] })),
                ]);
                const all = [...(firstPage.coupons ?? [])];
                let settingsOk = firstPage.offerSettingsOk !== false;
                let cursor = firstPage.nextCursor ?? null;
                for (let page = 1; cursor && page < MAX_COUPON_PAGES; page += 1) {
                    const next = await getAdminCoupons(accessToken, { limit: 100, cursor });
                    all.push(...(next.coupons ?? []));
                    settingsOk = settingsOk && next.offerSettingsOk !== false;
                    cursor = next.nextCursor ?? null;
                }
                if (cancelled) return;
                setCoupons(all);
                setOfferSettingsOk(settingsOk);
                setWorkshops(
                    (workshopsResult.data || []).map((item) => ({
                        id: item.id,
                        title: item.title,
                        date: item.date,
                        time: item.time,
                    }))
                );
            } catch (error) {
                if (!cancelled) {
                    setLoadError(toApiErrorMessage(error, "Unable to load offers right now."));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, [accessToken, reloadKey]);

    const replaceCoupon = (next: AdminCoupon) =>
        setCoupons((prev) => prev.map((item) => (item.id === next.id ? next : item)));

    const handleCreate = async (payload: OfferPayload) => {
        if (!accessToken) return;
        setSavingId("new");
        setEditorError(null);
        setNotice(null);
        try {
            const result = await createAdminCoupon(accessToken, {
                ...payload,
                code: payload.code ?? "",
            });
            setCoupons((prev) => [result.coupon, ...prev]);
            setCreating(false);
            setCreateKey((key) => key + 1);
            const elsewhere = workshopId && !offerAppliesToWorkshop(result.coupon, workshopId);
            setNotice(
                result.warning
                    ? { tone: "warning", text: result.warning }
                    : {
                          tone: "success",
                          text: elsewhere
                              ? `Offer ${result.coupon.code} added. It applies to other workshops, so it is not listed here; see Admin > Offers.`
                              : `Offer ${result.coupon.code} added.`,
                      }
            );
            onChange?.();
        } catch (error) {
            setEditorError(toApiErrorMessage(error, "Unable to add the offer right now."));
        } finally {
            setSavingId(null);
        }
    };

    const handleUpdate = async (coupon: AdminCoupon, payload: OfferPayload) => {
        if (!accessToken) return;
        setSavingId(coupon.id);
        setEditorError(null);
        setNotice(null);
        try {
            // The code cannot change; the route ignores it anyway.
            const { code: _code, ...changes } = payload;
            void _code;
            const result = await updateAdminCoupon(accessToken, coupon.id, changes);
            replaceCoupon(result.coupon);
            setEditingId(null);
            setNotice(
                result.warning
                    ? { tone: "warning", text: result.warning }
                    : { tone: "success", text: `Offer ${coupon.code} saved.` }
            );
            onChange?.();
        } catch (error) {
            setEditorError(toApiErrorMessage(error, "Unable to save the offer right now."));
        } finally {
            setSavingId(null);
        }
    };

    const handleToggleActive = async (coupon: AdminCoupon) => {
        if (!accessToken || savingId) return;
        const nextActive = !coupon.is_active;
        setSavingId(coupon.id);
        setNotice(null);
        replaceCoupon({ ...coupon, is_active: nextActive });
        try {
            const result = await updateAdminCoupon(accessToken, coupon.id, {
                is_active: nextActive,
            });
            replaceCoupon(result.coupon);
            onChange?.();
        } catch (error) {
            replaceCoupon(coupon);
            setNotice({
                tone: "error",
                text: toApiErrorMessage(error, "Unable to change the offer right now."),
            });
        } finally {
            setSavingId(null);
        }
    };

    const handleDelete = async (coupon: AdminCoupon) => {
        if (!accessToken || savingId) return;
        setConfirmDeleteId(null);
        setSavingId(coupon.id);
        setNotice(null);
        try {
            const result = await deleteAdminCoupon(accessToken, coupon.id);
            setCoupons((prev) => prev.filter((item) => item.id !== coupon.id));
            if (editingId === coupon.id) setEditingId(null);
            setNotice(
                result.warning
                    ? { tone: "warning", text: result.warning }
                    : { tone: "success", text: `Offer ${coupon.code} deleted.` }
            );
            onChange?.();
        } catch (error) {
            setNotice({
                tone: "error",
                text: toApiErrorMessage(error, "Unable to delete the offer right now."),
            });
        } finally {
            setSavingId(null);
        }
    };

    const describeWorkshops = (coupon: AdminCoupon) => {
        const ids = coupon.applicable_workshop_ids ?? [];
        if (ids.length === 0) return "All workshops";
        if (workshopId && ids.length === 1 && ids[0] === workshopId) return "This workshop only";
        const names = ids.map((id) => workshopTitleById.get(id) ?? "Older workshop");
        return names.length <= 2
            ? names.join(", ")
            : `${names.slice(0, 2).join(", ")} +${names.length - 2} more`;
    };

    const describeEnd = (coupon: AdminCoupon) => {
        if (!coupon.valid_until) return "No end date";
        const visibility = coupon.visibility ?? "hidden";
        const shownEnd = enteredEndFromValidUntil(coupon.valid_until, visibility);
        const ends = formatIst(shownEnd ? `${shownEnd}:00+05:30` : coupon.valid_until);
        return isAdvertised(visibility)
            ? `Ends ${ends}${coupon.show_end_date ? " (shown)" : ""}`
            : `Ends ${ends}`;
    };

    const busy = savingId !== null;
    const newOfferLabel = workshop ? "Add offer for this workshop" : "New offer";

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading offers...
            </div>
        );
    }

    if (loadError) {
        return (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <span>{loadError}</span>
                    <button
                        type="button"
                        onClick={() => setReloadKey((key) => key + 1)}
                        className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                    >
                        Try again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <p
                className="rounded-xl border border-clay/30 bg-cream-50 px-4 py-3 text-xs font-inter text-dark-muted"
                data-testid="offers-combine-note"
            >
                <span className="font-semibold text-dark">How offers combine:</span> a booking gets
                the workshop&apos;s Early Bird (if it has one) plus ONE offer, the one that saves
                the customer the most. Offers do not add up, so a smaller offer shows &quot;A bigger
                offer is applied&quot; on the workshop page.
            </p>

            {!creating && (
                <div className="flex sm:justify-end">
                    <button
                        type="button"
                        onClick={() => {
                            setEditorError(null);
                            setEditingId(null);
                            setCreating(true);
                        }}
                        disabled={busy}
                        className="btn-primary !px-4 !py-2 justify-center"
                    >
                        <Plus className="h-4 w-4" />
                        {newOfferLabel}
                    </button>
                </div>
            )}

            {!offerSettingsOk && (
                <NoticeBox
                    notice={{
                        tone: "warning",
                        text: "The offer settings could not be read, so every offer shows as Hidden code below and editing is off. Reload the page to try again.",
                    }}
                />
            )}
            <NoticeBox notice={notice} />

            {creating && (
                <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft sm:p-6">
                    <h3 className="mb-4 flex items-center gap-2 text-lg font-playfair font-bold text-dark">
                        <Tag className="h-5 w-5 text-terracotta" />
                        {workshop ? `New offer for ${workshop.title}` : "New offer"}
                    </h3>
                    <OfferEditor
                        key={createKey}
                        initial={newOfferForm}
                        isNew
                        workshops={workshops}
                        todayIso={todayIso}
                        saving={savingId === "new"}
                        serverError={editorError}
                        onSubmit={handleCreate}
                        onCancel={() => {
                            setCreating(false);
                            setEditorError(null);
                        }}
                    />
                </section>
            )}

            <ul
                className={`grid grid-cols-1 gap-4 ${workshop ? "" : "xl:grid-cols-2"}`}
                aria-label={workshop ? `Offers for ${workshop.title}` : "Offers"}
            >
                {listed.map((coupon) => {
                    const isEditing = editingId === coupon.id;
                    const isSaving = savingId === coupon.id;
                    const visibility = coupon.visibility ?? "hidden";
                    return (
                        <li
                            key={coupon.id}
                            className={`rounded-2xl border border-gray-100 bg-white p-4 shadow-soft sm:p-5 ${
                                isEditing && !workshop ? "xl:col-span-2" : ""
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="rounded-md bg-cream-100 px-2 py-0.5 font-mono text-sm font-semibold text-dark">
                                            {coupon.code}
                                        </span>
                                        <span
                                            className={`rounded-full border px-2.5 py-0.5 text-[11px] font-inter font-semibold uppercase tracking-wide ${
                                                VISIBILITY_BADGE[visibility] ??
                                                VISIBILITY_BADGE.hidden
                                            }`}
                                        >
                                            {visibilityLabel(visibility)}
                                        </span>
                                    </div>
                                    {coupon.label && (
                                        <p className="mt-1.5 truncate text-sm font-inter font-semibold text-dark">
                                            {coupon.label}
                                        </p>
                                    )}
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => void handleToggleActive(coupon)}
                                        disabled={busy}
                                        aria-pressed={coupon.is_active === true}
                                        className={`inline-flex min-h-[36px] items-center gap-1 rounded-full px-3 py-1 text-xs font-inter font-semibold disabled:opacity-60 ${
                                            coupon.is_active
                                                ? "bg-emerald-50 text-emerald-700"
                                                : "bg-gray-100 text-dark-muted"
                                        }`}
                                    >
                                        {isSaving && !isEditing ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : coupon.is_active ? (
                                            <ToggleRight className="h-4 w-4" />
                                        ) : (
                                            <ToggleLeft className="h-4 w-4" />
                                        )}
                                        {coupon.is_active ? "Active" : "Off"}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setConfirmDeleteId((current) =>
                                                current === coupon.id ? null : coupon.id
                                            )
                                        }
                                        disabled={busy}
                                        aria-label={`Delete offer ${coupon.code}`}
                                        title="Delete offer"
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-full text-dark-muted hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                                    >
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </div>
                            </div>

                            <dl className="mt-3 grid grid-cols-1 gap-1 text-xs font-inter text-dark-muted sm:grid-cols-2">
                                <div>
                                    <dt className="sr-only">Discount</dt>
                                    <dd className="font-semibold text-dark">
                                        {describeDiscount(
                                            coupon.discount_type,
                                            Number(coupon.discount_value)
                                        )}
                                        {coupon.discount_type === "fixed" ? " per booking" : ""}
                                        {coupon.min_guests && coupon.min_guests > 1
                                            ? ` · ${coupon.min_guests}+ seats`
                                            : ""}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="sr-only">Uses</dt>
                                    <dd>
                                        {coupon.used_count ?? 0}
                                        {coupon.max_uses ? `/${coupon.max_uses}` : ""} uses
                                    </dd>
                                </div>
                                <div>
                                    <dt className="sr-only">Workshops</dt>
                                    <dd>{describeWorkshops(coupon)}</dd>
                                </div>
                                <div>
                                    <dt className="sr-only">End</dt>
                                    <dd>{describeEnd(coupon)}</dd>
                                </div>
                            </dl>

                            {confirmDeleteId === coupon.id && (
                                <div
                                    role="group"
                                    aria-label={`Confirm deleting offer ${coupon.code}`}
                                    onKeyDown={(event) => {
                                        if (event.key === "Escape") setConfirmDeleteId(null);
                                    }}
                                    className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3"
                                >
                                    <p className="text-sm font-inter text-dark">
                                        Delete offer {coupon.code}? This cannot be undone. Bookings
                                        that already used it keep their discount; to pause it
                                        instead, switch it off.
                                    </p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            autoFocus
                                            aria-label={`Delete offer ${coupon.code} permanently`}
                                            onClick={() => void handleDelete(coupon)}
                                            className="min-h-[44px] rounded-full bg-red-600 px-4 py-2 text-sm font-inter font-semibold text-white transition-colors hover:bg-red-700"
                                        >
                                            Delete offer
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDeleteId(null)}
                                            className="min-h-[44px] rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-inter font-semibold text-dark transition-colors hover:bg-gray-50"
                                        >
                                            Keep offer
                                        </button>
                                    </div>
                                </div>
                            )}

                            {isEditing ? (
                                <div className="mt-4 rounded-xl border border-clay/30 bg-cream-50 p-4">
                                    <OfferEditor
                                        initial={formFromCoupon(coupon)}
                                        isNew={false}
                                        workshops={workshops}
                                        todayIso={todayIso}
                                        saving={isSaving}
                                        serverError={editorError}
                                        onSubmit={(payload) => handleUpdate(coupon, payload)}
                                        onCancel={() => {
                                            setEditingId(null);
                                            setEditorError(null);
                                        }}
                                    />
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setEditorError(null);
                                        setCreating(false);
                                        setEditingId(coupon.id);
                                    }}
                                    disabled={busy || !offerSettingsOk}
                                    className="btn-secondary mt-4 !px-4 !py-2 text-sm disabled:opacity-60"
                                >
                                    <PencilLine className="h-4 w-4" />
                                    Edit
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            {listed.length === 0 && !creating && (
                <div className="rounded-2xl bg-white p-8 text-center shadow-soft">
                    <p className="mb-4 text-body text-dark-muted">
                        {workshop ? "No offers for this workshop yet." : "No offers yet."}
                    </p>
                    <button type="button" onClick={() => setCreating(true)} className="btn-primary">
                        <Plus className="h-4 w-4" />
                        {newOfferLabel}
                    </button>
                </div>
            )}
        </div>
    );
}
