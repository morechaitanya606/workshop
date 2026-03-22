"use client";

import { useEffect, useState } from "react";
import {
    Loader2,
    Plus,
    Tag,
    ToggleLeft,
    ToggleRight,
    Trash2,
    Search,
    Percent,
    Hash,
} from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";

type PlatformSettings = {
    service_fee?: number;
};

type Coupon = {
    id: string;
    code: string;
    discount_type: "percentage" | "fixed";
    discount_value: number;
    is_active: boolean;
    used_count: number;
    valid_until: string | null;
    created_at: string;
};

export default function AdminSettingsPage() {
    const { session } = useAuth();
    const [settings, setSettings] = useState<PlatformSettings>({});
    const [coupons, setCoupons] = useState<Coupon[]>([]);
    const [loading, setLoading] = useState(true);

    const [feeInput, setFeeInput] = useState("");
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsMsg, setSettingsMsg] = useState("");

    const [creatingCoupon, setCreatingCoupon] = useState(false);
    const [couponMsg, setCouponMsg] = useState("");
    const [newCoupon, setNewCoupon] = useState({
        code: "",
        discount_type: "percentage" as "percentage" | "fixed",
        discount_value: "",
    });

    useEffect(() => {
        const fetchData = async () => {
            try {
                const headers: Record<string, string> = {};
                if (session?.access_token) {
                    headers["Authorization"] = `Bearer ${session.access_token}`;
                }

                const [settingsRes, couponsRes] = await Promise.all([
                    fetch("/api/settings", { headers }),
                    fetch("/api/coupons", { headers }),
                ]);

                if (settingsRes.ok) {
                    const data = await settingsRes.json();
                    setSettings(data.settings);
                    setFeeInput((data.settings.service_fee || "").toString());
                }

                if (couponsRes.ok) {
                    const data = await couponsRes.json();
                    setCoupons(data.coupons);
                }
            } catch (error) {
                console.error("Failed to load settings data", error);
            } finally {
                setLoading(false);
            }
        };

        void fetchData();
    }, []);

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        setSettingsMsg("");

        const fee = parseFloat(feeInput);
        if (isNaN(fee) || fee < 0) {
            setSettingsMsg("Please enter a valid non-negative number.");
            setSavingSettings(false);
            return;
        }

        try {
            const res = await fetch("/api/settings", {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(session?.access_token && {
                        Authorization: `Bearer ${session.access_token}`,
                    }),
                },
                body: JSON.stringify({ settings: { service_fee: fee } }),
            });

            if (res.ok) {
                setSettings({ ...settings, service_fee: fee });
                setSettingsMsg("Settings saved successfully!");
                setTimeout(() => setSettingsMsg(""), 3000);
            } else {
                const data = await res.json();
                setSettingsMsg(data.error || "Failed to save settings.");
            }
        } catch (error) {
            setSettingsMsg("Network error trying to save.");
        } finally {
            setSavingSettings(false);
        }
    };

    const handleCreateCoupon = async (e: React.FormEvent) => {
        e.preventDefault();
        setCreatingCoupon(true);
        setCouponMsg("");

        if (!newCoupon.code.trim() || !newCoupon.discount_value) {
            setCouponMsg("Please fill out all fields.");
            setCreatingCoupon(false);
            return;
        }

        try {
            const res = await fetch("/api/coupons", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    ...(session?.access_token && {
                        Authorization: `Bearer ${session.access_token}`,
                    }),
                },
                body: JSON.stringify({
                    code: newCoupon.code,
                    discount_type: newCoupon.discount_type,
                    discount_value: parseFloat(newCoupon.discount_value),
                }),
            });

            const data = await res.json();
            if (res.ok) {
                setCoupons([data.coupon, ...coupons]);
                setNewCoupon({ code: "", discount_type: "percentage", discount_value: "" });
                setCouponMsg("Coupon created successfully!");
                setTimeout(() => setCouponMsg(""), 3000);
            } else {
                setCouponMsg(data.error || "Failed to create coupon.");
            }
        } catch (error) {
            setCouponMsg("Network error.");
        } finally {
            setCreatingCoupon(false);
        }
    };

    const handleToggleCoupon = async (id: string, currentStatus: boolean) => {
        try {
            const res = await fetch(`/api/coupons/${id}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    ...(session?.access_token && {
                        Authorization: `Bearer ${session.access_token}`,
                    }),
                },
                body: JSON.stringify({ is_active: !currentStatus }),
            });

            if (res.ok) {
                setCoupons(
                    coupons.map((c) => (c.id === id ? { ...c, is_active: !currentStatus } : c))
                );
            }
        } catch (error) {
            console.error("Failed to toggle coupon status", error);
        }
    };

    if (loading) {
        return (
            <div className="flex h-64 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-terracotta" />
            </div>
        );
    }

    return (
        <div className="space-y-8 pb-12">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="heading-lg text-dark">Platform Settings</h1>
                    <p className="text-body text-dark-muted mt-1">
                        Manage global parameters, service fees, and discount coupons.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Global Settings */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-soft">
                        <h2 className="text-lg font-playfair font-bold text-dark mb-4">
                            Service Fee
                        </h2>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-inter font-semibold uppercase tracking-wider text-dark-muted mb-2">
                                    Fixed Amount (Rupees)
                                </label>
                                <div className="relative">
                                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-dark-muted font-medium">
                                        ₹
                                    </span>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        value={feeInput}
                                        onChange={(e) => setFeeInput(e.target.value)}
                                        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 pl-8 text-sm font-inter text-dark outline-none focus:border-terracotta/50 focus:bg-white focus:ring-2 focus:ring-terracotta/10 transition-all"
                                    />
                                </div>
                                <p className="text-xs text-dark-muted mt-2">
                                    This fee is charged to customers on every transaction.
                                </p>
                            </div>

                            <button
                                onClick={handleSaveSettings}
                                disabled={savingSettings}
                                className="btn-primary w-full"
                            >
                                {savingSettings ? "Saving..." : "Save Settings"}
                            </button>

                            {settingsMsg && (
                                <p
                                    className={`text-sm font-medium ${settingsMsg.includes("success") ? "text-emerald-600" : "text-red-500"}`}
                                >
                                    {settingsMsg}
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Coupons */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-soft overflow-hidden">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                            <h2 className="text-lg font-playfair font-bold text-dark flex items-center gap-2">
                                <Tag className="w-5 h-5 text-terracotta" />
                                Coupon Codes
                            </h2>
                        </div>

                        {/* Create form */}
                        <form
                            onSubmit={handleCreateCoupon}
                            className="bg-cream-50 p-4 rounded-xl border border-clay/30 mb-8 grid grid-cols-1 sm:grid-cols-4 gap-4 items-end"
                        >
                            <div className="col-span-1 sm:col-span-2">
                                <label className="block text-xs font-inter font-semibold text-dark-muted mb-1">
                                    Coupon Code
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. SUMMER20"
                                    value={newCoupon.code}
                                    onChange={(e) =>
                                        setNewCoupon({
                                            ...newCoupon,
                                            code: e.target.value.toUpperCase(),
                                        })
                                    }
                                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm uppercase"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-inter font-semibold text-dark-muted mb-1">
                                    Type
                                </label>
                                <select
                                    value={newCoupon.discount_type}
                                    onChange={(e) =>
                                        setNewCoupon({
                                            ...newCoupon,
                                            discount_type: e.target.value as any,
                                        })
                                    }
                                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                                >
                                    <option value="percentage">Percentage (%)</option>
                                    <option value="fixed">Fixed (₹)</option>
                                </select>
                            </div>
                            <div className="relative">
                                <label className="block text-xs font-inter font-semibold text-dark-muted mb-1">
                                    Amount
                                </label>
                                <input
                                    type="number"
                                    placeholder="Value"
                                    value={newCoupon.discount_value}
                                    onChange={(e) =>
                                        setNewCoupon({
                                            ...newCoupon,
                                            discount_value: e.target.value,
                                        })
                                    }
                                    className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
                                />
                            </div>
                            <div className="col-span-1 sm:col-span-4 flex items-center justify-between flex-wrap gap-2">
                                <button
                                    type="submit"
                                    disabled={creatingCoupon}
                                    className="btn-secondary !py-2 !px-4 text-sm flex items-center gap-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    {creatingCoupon ? "Adding..." : "Add Coupon"}
                                </button>
                                {couponMsg && (
                                    <p
                                        className={`text-xs font-medium ${couponMsg.includes("success") ? "text-emerald-600" : "text-red-500"}`}
                                    >
                                        {couponMsg}
                                    </p>
                                )}
                            </div>
                        </form>

                        {/* List */}
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm font-inter">
                                <thead className="border-b border-gray-100 text-dark-muted text-xs uppercase tracking-wider">
                                    <tr>
                                        <th className="pb-3 font-semibold">Code</th>
                                        <th className="pb-3 font-semibold">Discount</th>
                                        <th className="pb-3 font-semibold">Uses</th>
                                        <th className="pb-3 font-semibold">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {coupons.map((coupon) => (
                                        <tr key={coupon.id} className="group">
                                            <td className="py-4">
                                                <span className="font-bold font-mono bg-gray-100 text-gray-800 px-2 py-1 rounded">
                                                    {coupon.code}
                                                </span>
                                            </td>
                                            <td className="py-4 text-dark font-medium">
                                                {coupon.discount_type === "percentage"
                                                    ? `${coupon.discount_value}% OFF`
                                                    : `${formatCurrency(coupon.discount_value)} OFF`}
                                            </td>
                                            <td className="py-4 text-dark-muted">
                                                {coupon.used_count} uses
                                            </td>
                                            <td className="py-4">
                                                <button
                                                    onClick={() =>
                                                        handleToggleCoupon(
                                                            coupon.id,
                                                            coupon.is_active
                                                        )
                                                    }
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                                                        coupon.is_active
                                                            ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                                                    }`}
                                                >
                                                    {coupon.is_active ? "Active" : "Disabled"}
                                                    {coupon.is_active ? (
                                                        <ToggleRight className="w-4 h-4 ml-1" />
                                                    ) : (
                                                        <ToggleLeft className="w-4 h-4 ml-1" />
                                                    )}
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
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
                    </div>
                </div>
            </div>
        </div>
    );
}
