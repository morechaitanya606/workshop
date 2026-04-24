import { Check } from "lucide-react";

export default function BookingStepIndicator({ labels, step }: { labels: string[]; step: number }) {
    return (
        <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-4 shadow-soft">
            <ol className="grid grid-cols-3 gap-2">
                {labels.map((label, index) => {
                    const stepNumber = index + 1;
                    const isDone = step > stepNumber;
                    const isActive = step === stepNumber;

                    return (
                        <li
                            key={label}
                            className="flex items-center gap-2 text-xs font-inter sm:text-sm"
                        >
                            <span
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold ${
                                    isDone
                                        ? "border-emerald-300 bg-emerald-100 text-emerald-700"
                                        : isActive
                                          ? "border-terracotta bg-terracotta text-white"
                                          : "border-gray-200 bg-white text-dark-muted"
                                }`}
                            >
                                {isDone ? <Check className="h-3.5 w-3.5" /> : stepNumber}
                            </span>
                            <span className={isActive || isDone ? "text-dark" : "text-dark-muted"}>
                                {label}
                            </span>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
