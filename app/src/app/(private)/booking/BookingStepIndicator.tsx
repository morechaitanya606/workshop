import { Check } from "lucide-react";

/**
 * Three connected steps: Details -> Review & pay -> Confirmation.
 * Circles + labels + a filled connector, so progress reads without relying on colour alone
 * (done steps show a check, the current one is marked aria-current="step").
 */
export default function BookingStepIndicator({ labels, step }: { labels: string[]; step: number }) {
    return (
        <nav aria-label="Booking progress" className="mb-6">
            <ol className="flex items-start">
                {labels.map((label, index) => {
                    const stepNumber = index + 1;
                    const isDone = step > stepNumber;
                    const isActive = step === stepNumber;
                    const isLast = index === labels.length - 1;

                    return (
                        <li
                            key={label}
                            aria-current={isActive ? "step" : undefined}
                            className={`flex items-start ${isLast ? "" : "flex-1"}`}
                        >
                            <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:gap-2.5">
                                <span
                                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-xs font-inter font-semibold transition-colors ${
                                        isDone
                                            ? "border-emerald-600 bg-emerald-600 text-white"
                                            : isActive
                                              ? "border-terracotta bg-terracotta text-white shadow-glow"
                                              : "border-clay bg-white text-dark-muted"
                                    }`}
                                >
                                    {isDone ? (
                                        <Check
                                            className="h-4 w-4"
                                            strokeWidth={3}
                                            aria-hidden="true"
                                        />
                                    ) : (
                                        stepNumber
                                    )}
                                    <span className="sr-only">
                                        {isDone
                                            ? " (completed)"
                                            : isActive
                                              ? " (current step)"
                                              : ""}
                                    </span>
                                </span>
                                <span
                                    className={`text-center text-[11px] font-inter leading-tight sm:text-left sm:text-sm ${
                                        isActive
                                            ? "font-semibold text-dark"
                                            : isDone
                                              ? "font-medium text-dark-secondary"
                                              : "text-dark-muted"
                                    }`}
                                >
                                    {label}
                                </span>
                            </div>
                            {!isLast && (
                                <span
                                    aria-hidden="true"
                                    className={`mx-2 mt-4 h-0.5 flex-1 rounded-full sm:mx-4 ${
                                        isDone ? "bg-emerald-600" : "bg-clay/70"
                                    }`}
                                />
                            )}
                        </li>
                    );
                })}
            </ol>
        </nav>
    );
}
