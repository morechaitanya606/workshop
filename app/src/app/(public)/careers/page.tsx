import { BriefcaseBusiness } from "lucide-react";
import StaticPage from "@/components/StaticPage";
import { Metadata } from "next";
import CareersApplicationForm from "./CareersApplicationForm";

export const metadata: Metadata = {
    title: "Careers | Only Workshops",
    description:
        "Join our team at Only Workshops. We are looking for talented creators, storytellers, and marketing talent to shape the future of creative experiences.",
    openGraph: {
        title: "Careers | Only Workshops",
        description:
            "Join our team at Only Workshops. We are looking for talented creators, storytellers, and marketing talent to shape the future of creative experiences.",
    },
};
const hiringRoles = [
    "Directors",
    "Storytellers",
    "Social media managers",
    "Photographers",
    "Digital marketing talent",
];

export default function CareersPage() {
    return (
        <StaticPage
            title="Careers"
            description="We are building the future of creative experiences and brand storytelling at Only Workshops."
            icon={<BriefcaseBusiness className="h-6 w-6" />}
        >
            <div className="space-y-4">
                <p>
                    We are currently looking for directors, storytellers, social media managers,
                    photographers, and digital marketing talent. If that sounds like you, apply
                    below with your resume and a quick introduction.
                </p>
                <div className="flex flex-wrap gap-2">
                    {hiringRoles.map((role) => (
                        <span
                            key={role}
                            className="inline-flex items-center rounded-full bg-terracotta/10 px-3 py-1.5 text-xs font-inter font-semibold text-terracotta"
                        >
                            {role}
                        </span>
                    ))}
                </div>
                <p>
                    We care about taste, reliability, and people who can help us tell great stories
                    around workshops, creators, and culture.
                </p>
            </div>

            <div className="space-y-4">
                <div>
                    <h2 className="heading-sm mb-2">Apply with your resume</h2>
                    <p className="text-body text-dark-muted">
                        Share your details, the role you are interested in, and your resume. Our
                        team will review it and get back to you.
                    </p>
                </div>
                <CareersApplicationForm />
            </div>
        </StaticPage>
    );
}
