"use client";

import { useEffect, useState } from "react";
import {
    CalendarDays,
    Gift,
    IndianRupee,
    Loader2,
    Plus,
    Tag,
    ToggleLeft,
    ToggleRight,
} from "lucide-react";

import AdminShell from "@/components/admin/AdminShell";
import { Stat } from "@/components/ui";
import {
    createAdminCoupon,
    getAdminCoupons,
    getPlatformSettings,
    toApiErrorMessage,
    updateAdminCoupon,
    updatePlatformSettings,
    type AdminCoupon,
    type PlatformSettings,
} from "@/lib/api-client";
import { useAuth } from "@/lib/auth-context";
import { usePlatformSettings } from "@/lib/platform-settings-context";
import {
    DEFAULT_SPECIAL_PAGE_SETTINGS,
    normalizeSpecialPageDate,
    normalizeSpecialPagePath,
    resolveSpecialPageSettings,
} from "@/lib/special-page";
import { formatCurrency } from "@/lib/utils";

const DEFAULT_SERVICE_FEE = 99;

type CouponRecord = Omit<AdminCoupon, "is_active" | "used_count"> & {
    is_active: boolean;
    used_count: number;
};

type CouponFormState = {
    code: string;
    discount_type: "percentage" | "fixed";
    discount_value: string;
};

type SpecialPageFormState = {
    enabled: boolean;
    path: string;
    title: string;
    description: string;
    badge: string;
    ctaLabel: string;
    visibleUntil: string;
};

const INITIAL_COUPON_FORM: CouponFormState = {
    code: "",
    discount_type: "percentage",
    discount_value: "",
};

const INITIAL_SPECIAL_PAGE_FORM: SpecialPageFormState = {
    enabled: DEFAULT_SPECIAL_PAGE_SETTINGS.enabled,
    path: DEFAULT_SPECIAL_PAGE_SETTINGS.path,
    title: DEFAULT_SPECIAL_PAGE_SETTINGS.title,
    description: DEFAULT_SPECIAL_PAGE_SETTINGS.description,
    badge: DEFAULT_SPECIAL_PAGE_SETTINGS.badge,
    ctaLabel: DEFAULT_SPECIAL_PAGE_SETTINGS.ctaLabel,
    visibleUntil: DEFAULT_SPECIAL_PAGE_SETTINGS.visibleUntil,
};

function normalizeCoupon(coupon: AdminCoupon): CouponRecord {
    return {
        ...coupon,
        is_active: coupon.is_active ?? false,
        used_count: coupon.used_count ?? 0,
    };
}

export default function AdminSettingsPage() {
    const { session } = useAuth();
    const { mergeSettings } = usePlatformSettings();
    const [settings, setSettings] = useState<PlatformSettings>({});
    const [coupons, setCoupons] = useState<CouponRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const [feeInput, setFeeInput] = useState(String(DEFAULT_SERVICE_FEE));
    const [specialPageForm, setSpecialPageForm] =
        useState<SpecialPageFormState>(INITIAL_SPECIAL_PAGE_FORM);
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState<string | null>(null);

    const [creatingCoupon, setCreatingCoupon] = useState(false);
    const [couponMsg, setCouponMsg] = useState<string | null>(null);
    const [updatingCouponId, setUpdatingCouponId] = useState<string | null>(null);
    const [newCoupon, setNewCoupon] = useState<CouponFormState>(INITIAL_COUPON_FORM);

    useEffect(() => {
        if (!session?.access_token) return;

        let cancelled = false;

        const loadSettingsData = async () => {
            setLoading(true);
            setError(null);

            try {
                const [settingsResult, couponsResult] = await Promise.all([
                    getPlatformSettings(session.access_token),
                    getAdminCoupons(session.access_token),
                ]);

                if (cancelled) return;

                const nextSettings = settingsResult.settings || {};
                const rawFee = Number(nextSettings.service_fee);
                const nextSpecialPage = resolveSpecialPageSettings(nextSettings.special_page);

                setSettings(nextSettings);
                setFeeInput(
                    Number.isFinite(rawFee) && rawFee >= 0
                        ? String(rawFee)
                        : String(DEFAULT_SERVICE_FEE)
                );
                setSpecialPageForm({
                    enabled: nextSpecialPage.enabled,
                    path: nextSpecialPage.path,
                    title: nextSpecialPage.title,
                    description: nextSpecialPage.description,
                    badge: nextSpecialPage.badge,
                    ctaLabel: nextSpecialPage.ctaLabel,
                    visibleUntil: nextSpecialPage.visibleUntil,
                });
                setCoupons(
                    Array.isArray(couponsResult.coupons)
                        ? couponsResult.coupons.map(normalizeCoupon)
                        : []
                );
            } catch (loadError) {
                if (!cancelled) {
                    setError(
                        toApiErrorMessage(loadError, "Unable to load platform settings right now.")
                    );
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void loadSettingsData();

        return () => {
            cancelled = true;
        };
    }, [session?.access_token, reloadKey]);

    const handleRetry = () => {
        setError(null);
        setReloadKey((prev) => prev + 1);
    };

    const handleSaveSettings = async () => {
        if (!session?.access_token) return;

        const fee = Number.parseFloat(feeInput);
        if (!Number.isFinite(fee) || fee < 0) {
            setSettingsMsg("Please enter a valid non-negative fee.");
            return;
        }

        const title = specialPageForm.title.trim();
        const description = specialPageForm.description.trim();

        if (!title || !description) {
            setSettingsMsg("Please add a title and description for the special page.");
            return;
        }

        const nextSpecialPage = {
            enabled: specialPageForm.enabled,
            path: normalizeSpecialPagePath(specialPageForm.path),
            title,
            description,
            badge: specialPageForm.badge.trim() || DEFAULT_SPECIAL_PAGE_SETTINGS.badge,
            cta_label: specialPageForm.ctaLabel.trim() || DEFAULT_SPECIAL_PAGE_SETTINGS.ctaLabel,
            visible_until: normalizeSpecialPageDate(specialPageForm.visibleUntil),
        };

        setSavingSettings(true);
        setSettingsMsg(null);

        try {
            await updatePlatformSettings(session.access_token, {
                settings: {
                    service_fee: fee,
                    special_page: nextSpecialPage,
                },
            });

            const nextSettings = {
                ...settings,
                service_fee: fee,
                special_page: nextSpecialPage,
            };

            setSettings(nextSettings);
            mergeSettings(nextSettings);
            setSpecialPageForm({
                enabled: nextSpecialPage.enabled,
                path: nextSpecialPage.path,
                title: nextSpecialPage.title,
                description: nextSpecialPage.description,
                badge: nextSpecialPage.badge,
                ctaLabel: nextSpecialPage.cta_label,
                visibleUntil: nextSpecialPage.visible_until,
            });
            setSettingsMsg("Platform settings updated.");
        } catch (saveError) {
            setSettingsMsg(
                toApiErrorMessage(saveError, "Unable to save platform settings right now.")
            );
        } finally {
            setSavingSettings(false);
        }
    };

    const handleCreateCoupon = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!session?.access_token) return;

        const code = newCoupon.code.trim().toUpperCase();
        const discountValue = Number.parseFloat(newCoupon.discount_value);

        if (!code || !Number.isFinite(discountValue) || discountValue <= 0) {
            setCouponMsg("Enter a coupon code and a valid discount value.");
            return;
        }

        setCreatingCoupon(true);
        setCouponMsg(null);

        try {
            const result = await createAdminCoupon(session.access_token, {
                code,
                discount_type: newCoupon.discount_type,
                discount_value: discountValue,
            });

            setCoupons((prev) => [normalizeCoupon(result.coupon), ...prev]);
            setNewCoupon(INITIAL_COUPON_FORM);
            setCouponMsg("Coupon created successfully.");
        } catch (createError) {
            setCouponMsg(toApiErrorMessage(createError, "Unable to create coupon right now."));
        } finally {
            setCreatingCoupon(false);
        }
    };

    const handleToggleCoupon = async (coupon: CouponRecord) => {
        if (!session?.access_token) return;

        const nextStatus = !coupon.is_active;
        setUpdatingCouponId(coupon.id);
        setCouponMsg(null);

        setCoupons((prev) =>
            prev.map((item) => (item.id === coupon.id ? { ...item, is_active: nextStatus } : item))
        );

        try {
            const result = await updateAdminCoupon(session.access_token, coupon.id, {
                is_active: nextStatus,
            });

            setCoupons((prev) =>
                prev.map((item) => (item.id === coupon.id ? normalizeCoupon(result.coupon) : item))
            );
        } catch (updateError) {
            setCoupons((prev) =>
                prev.map((item) =>
                    item.id === coupon.id ? { ...item, is_active: coupon.is_active } : item
                )
            );
            setCouponMsg(toApiErrorMessage(updateError, "Unable to update coupon status."));
        } finally {
            setUpdatingCouponId(null);
        }
    };

    const serviceFee = Number(settings.service_fee ?? DEFAULT_SERVICE_FEE);
    const activeCoupons = coupons.filter((coupon) => coupon.is_active).length;
    const specialPageStatus = specialPageForm.enabled ? "Active" : "Disabled";

    return (
        <AdminShell>
            <div className="mb-8">
                <p className="mb-2 text-xs font-inter font-bold uppercase tracking-wider text-terracotta">
                    Admin
                </p>
                <h1 className="heading-md">Platform Settings</h1>
                <p className="mt-1 text-body text-dark-muted">
                    Manage the service fee, special page promotion, and platform-wide coupon
                    campaigns.
                </p>
            </div>

            {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-inter text-red-700">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <span>{error}</span>
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100"
                        >
                            Try again
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-sm font-inter text-dark-muted">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading platform settings...
                </div>
            ) : (
                <div className="space-y-8">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
                        <Stat
                            label="Service Fee"
                            value={formatCurrency(serviceFee)}
                            icon={<IndianRupee className="h-5 w-5 text-terracotta" />}
                        />
                        <Stat
                            label="Special Page"
                            value={specialPageStatus}
                            icon={<Gift className="h-5 w-5 text-terracotta" />}
                        />
                        <Stat
                            label="Coupon Codes"
                            value={coupons.length}
                            icon={<Tag className="h-5 w-5 text-terracotta" />}
                        />
                        <Stat
                            label="Active Coupons"
                            value={activeCoupons}
                            icon={<ToggleRight className="h-5 w-5 text-terracotta" />}
                        />
                    </div>
                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[360px,1fr]">
                        <div className="space-y-6">
                            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                                <h2 className="text-lg font-playfair font-bold text-dark">
                                    Service Fee
                                </h2>
                                <p className="mt-1 text-sm font-inter text-dark-muted">
                                    Applied to each successful booking across the platform.
                                </p>

                                <div className="mt-6">
                                    <label className="mb-2 block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted">
                                        Fixed Amount (Rupees)
                                    </label>
                                    <div className="relative">
                                        <IndianRupee className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-dark-muted" />
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={feeInput}
                                            onChange={(event) => setFeeInput(event.target.value)}
                                            className="w-full rounded-xl border border-gray-200 bg-cream-100 py-3 pl-10 pr-4 text-sm font-inter text-dark outline-none transition-all focus:border-terracotta/50 focus:bg-white focus:ring-2 focus:ring-terracotta/10"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                                <div className="flex items-start justify-between gap-4">
                                    <div>
                                        <h2 className="flex items-center gap-2 text-lg font-playfair font-bold text-dark">
                                            <Gift className="h-5 w-5 text-terracotta" />
                                            Special Page
                                        </h2>
                                        <p className="mt-1 text-sm font-inter text-dark-muted">
                                            Control the homepage banner and floating surprise box.
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setSpecialPageForm((prev) => ({
                                                ...prev,
                                                enabled: !prev.enabled,
                                            }))
                                        }
                                        className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                                            specialPageForm.enabled
                                                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                        }`}
                                    >
                                        {specialPageForm.enabled ? "Enabled" : "Disabled"}
                                        {specialPageForm.enabled ? (
                                            <ToggleRight className="h-4 w-4" />
                                        ) : (
                                            <ToggleLeft className="h-4 w-4" />
                                        )}
                                    </button>
                                </div>

                                <div className="mt-6 space-y-4">
                                    <div>
                                        <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                            Page Path
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="/workshop/summer-family-retreat"
                                            value={specialPageForm.path}
                                            onChange={(event) =>
                                                setSpecialPageForm((prev) => ({
                                                    ...prev,
                                                    path: event.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                            Badge Label
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Special Event"
                                            value={specialPageForm.badge}
                                            onChange={(event) =>
                                                setSpecialPageForm((prev) => ({
                                                    ...prev,
                                                    badge: event.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                            Page Title
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Summer Family Retreat"
                                            value={specialPageForm.title}
                                            onChange={(event) =>
                                                setSpecialPageForm((prev) => ({
                                                    ...prev,
                                                    title: event.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                            Call To Action
                                        </label>
                                        <input
                                            type="text"
                                            placeholder="Discover More"
                                            value={specialPageForm.ctaLabel}
                                            onChange={(event) =>
                                                setSpecialPageForm((prev) => ({
                                                    ...prev,
                                                    ctaLabel: event.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 flex items-center gap-1.5 text-xs font-inter font-semibold text-dark-muted">
                                            <CalendarDays className="h-3.5 w-3.5" />
                                            Visible Until
                                        </label>
                                        <input
                                            type="date"
                                            value={specialPageForm.visibleUntil}
                                            onChange={(event) =>
                                                setSpecialPageForm((prev) => ({
                                                    ...prev,
                                                    visibleUntil: event.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                        />
                                    </div>

                                    <div>
                                        <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                            Description
                                        </label>
                                        <textarea
                                            rows={4}
                                            placeholder="Describe the special page that should be promoted on the homepage and in the floating surprise box."
                                            value={specialPageForm.description}
                                            onChange={(event) =>
                                                setSpecialPageForm((prev) => ({
                                                    ...prev,
                                                    description: event.target.value,
                                                }))
                                            }
                                            className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                        />
                                    </div>
                                </div>
                            </section>

                            <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                                <button
                                    type="button"
                                    onClick={handleSaveSettings}
                                    disabled={savingSettings}
                                    className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {savingSettings ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : null}
                                    {savingSettings ? "Saving..." : "Save Platform Settings"}
                                </button>

                                {settingsMsg && (
                                    <p
                                        className={`mt-3 text-sm font-medium ${
                                            settingsMsg.toLowerCase().includes("updated")
                                                ? "text-emerald-600"
                                                : "text-red-500"
                                        }`}
                                    >
                                        {settingsMsg}
                                    </p>
                                )}
                            </section>
                        </div>

                        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
                            <div className="mb-6">
                                <h2 className="flex items-center gap-2 text-lg font-playfair font-bold text-dark">
                                    <Tag className="h-5 w-5 text-terracotta" />
                                    Coupon Codes
                                </h2>
                                <p className="mt-1 text-sm font-inter text-dark-muted">
                                    Create and manage promotional discounts for checkout.
                                </p>
                            </div>

                            <form
                                onSubmit={handleCreateCoupon}
                                className="mb-8 grid grid-cols-1 gap-4 rounded-xl border border-clay/30 bg-cream-50 p-4 sm:grid-cols-4 sm:items-end"
                            >
                                <div className="sm:col-span-2">
                                    <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                        Coupon Code
                                    </label>
                                    <input
                                        type="text"
                                        placeholder="SUMMER20"
                                        value={newCoupon.code}
                                        onChange={(event) =>
                                            setNewCoupon((prev) => ({
                                                ...prev,
                                                code: event.target.value.toUpperCase(),
                                            }))
                                        }
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase text-dark outline-none focus:border-terracotta/50"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                        Type
                                    </label>
                                    <select
                                        value={newCoupon.discount_type}
                                        onChange={(event) =>
                                            setNewCoupon((prev) => ({
                                                ...prev,
                                                discount_type: event.target.value as
                                                    | "percentage"
                                                    | "fixed",
                                            }))
                                        }
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                    >
                                        <option value="percentage">Percentage (%)</option>
                                        <option value="fixed">Fixed (Rupees)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-inter font-semibold text-dark-muted">
                                        Amount
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        placeholder="Value"
                                        value={newCoupon.discount_value}
                                        onChange={(event) =>
                                            setNewCoupon((prev) => ({
                                                ...prev,
                                                discount_value: event.target.value,
                                            }))
                                        }
                                        className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-dark outline-none focus:border-terracotta/50"
                                    />
                                </div>
                                <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-4">
                                    <button
                                        type="submit"
                                        disabled={creatingCoupon}
                                        className="btn-secondary !px-4 !py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {creatingCoupon ? (
                                            <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <Plus className="h-4 w-4" />
                                        )}
                                        {creatingCoupon ? "Adding..." : "Add Coupon"}
                                    </button>
                                    {couponMsg && (
                                        <p
                                            className={`text-xs font-medium ${
                                                couponMsg.toLowerCase().includes("success")
                                                    ? "text-emerald-600"
                                                    : "text-red-500"
                                            }`}
                                        >
                                            {couponMsg}
                                        </p>
                                    )}
                                </div>
                            </form>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm font-inter">
                                    <thead className="border-b border-gray-100 text-xs uppercase tracking-wider text-dark-muted">
                                        <tr>
                                            <th className="pb-3 font-semibold">Code</th>
                                            <th className="pb-3 font-semibold">Discount</th>
                                            <th className="pb-3 font-semibold">Uses</th>
                                            <th className="pb-3 font-semibold">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {coupons.map((coupon) => {
                                            const isUpdating = updatingCouponId === coupon.id;

                                            return (
                                                <tr key={coupon.id}>
                                                    <td className="py-4">
                                                        <span className="rounded bg-gray-100 px-2 py-1 font-mono font-bold text-gray-800">
                                                            {coupon.code}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 font-medium text-dark">
                                                        {coupon.discount_type === "percentage"
                                                            ? `${coupon.discount_value}% OFF`
                                                            : `${formatCurrency(coupon.discount_value)} OFF`}
                                                    </td>
                                                    <td className="py-4 text-dark-muted">
                                                        {coupon.used_count} uses
                                                    </td>
                                                    <td className="py-4">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                void handleToggleCoupon(coupon)
                                                            }
                                                            disabled={isUpdating}
                                                            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
                                                                coupon.is_active
                                                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                            }`}
                                                        >
                                                            {coupon.is_active
                                                                ? "Active"
                                                                : "Disabled"}
                                                            {isUpdating ? (
                                                                <Loader2 className="ml-1 h-4 w-4 animate-spin" />
                                                            ) : coupon.is_active ? (
                                                                <ToggleRight className="ml-1 h-4 w-4" />
                                                            ) : (
                                                                <ToggleLeft className="ml-1 h-4 w-4" />
                                                            )}
                                                        </button>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {coupons.length === 0 && (
                                            <tr>
                                                <td
                                                    colSpan={4}
                                                    className="py-8 text-center text-dark-muted"
                                                >
                                                    No coupons created yet.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                </div>
            )}
        </AdminShell>
    );
}
