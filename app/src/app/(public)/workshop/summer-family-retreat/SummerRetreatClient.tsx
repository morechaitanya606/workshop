"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import "./summer-retreat.css";

const BACKGROUND_BLUR_DATA_URL =
    "data:image/webp;base64,UklGRlwAAABXRUJQVlA4IFAAAABQBACdASoYAA4APu1oqk6ppiQiMAgBMB2JYwCdIKnCuFggvoOI1MAOKCIAAPzGjtpjj5JhykDquZ039dd2WrOgZFh8KsmMoT5iBr2LutaAAA==";

const PARENT_EXPERIENCE = {
    title: "Cheese Tasting & Estate Tour | For Parents",
    description:
        "Hosted by The Yellow Slice, Pirangut, parents enjoy a guided walk through the cheese-making estate, a curated cheese board, seasonal fruits, and a sit-down dinner at 8 PM. It is a relaxed, memorable evening while the kids are in their workshop.",
};

const HERO_PILLS = [
    "May 9-10, 2026",
    "5 PM to 9 PM",
    "The Yellow Slice, Pirangut",
    "1 Child + 2 Parent",
];

const DAY_PROGRAMS = [
    {
        tabLabel: "Day 1 | May 9",
        byline: "DroneAcharya | Aerial Innovations",
        title: "Drone Making Workshop",
        description:
            "Students in Grades 7-10 assemble, program, and fly their own drone from scratch with expert guidance. It is a hands-on introduction to aerodynamics, electronics, and future-ready skills, with a takeaway to bring home.",
        badges: ["Grades 7-10", "5 PM to 9 PM", "Fly Your Own Drone", "Takeaway Included"],
        scheduleLabel: "Schedule | Day 1 | 9th May",
        timeline: [
            {
                time: "4:30-5:00 PM",
                label: "Arrival & Registration",
                details: "Welcome, check-in, and meet fellow families.",
            },
            {
                time: "5:00 PM - 7:30 PM",
                label: "Drone Workshop for children and Cheese Tasting & Estate Tour for Parents",
                details:
                    "Kids begin building while parents head to the estate tour and Artisan cheese and seasonal fruits for parents.",
            },
            {
                time: "7:30 PM",
                label: "Dinner",
                details: "Sit-down dinner for all families.",
            },
            {
                time: "8:00 PM - 8:30 PM",
                label: "Grand Fly-Off & Showcase",
                details: "Drone flights, photos, and celebration time.",
            },
            {
                time: "9:00 PM",
                label: "Wrap Up",
                details: "Takeaway and farewell.",
            },
        ],
    },
    {
        tabLabel: "Day 2 | May 10",
        byline: "Elevora Baking Academy",
        title: "Iced Cakesicles Workshop",
        description:
            "Kids aged 10+ create decorated iced cakesicles from scratch, learning chocolate tempering, moulding, and piping under expert guidance. Every child leaves with their own finished creations and a proud take-home moment.",
        badges: ["Ages 10+", "5 PM to 9 PM", "Take-Home Creation", "Takeaway Included"],
        scheduleLabel: "Schedule | Day 2 | 10th May",
        timeline: [
            {
                time: "5:00 PM",
                label: "Arrival & Registration",
                details: "Welcome, check-in, and meet fellow families.",
            },
            {
                time: "5:30 -7:30 PM",
                label: "Cakesicles Workshop Begins and  Cheese Tasting & Estate Tour for Parents",
                details:
                    "Kids start baking and parents explore the estate and Artisan cheese and seasonal fruits for parents.",
            },
            {
                time: "7:30 PM",
                label: "Dinner",
                details: "Sit-down dinner for all families.",
            },
            {
                time: "8:30 PM",
                label: "Showcase & Photo Moment",
                details: "Kids present their cakesicles and families capture the memory.",
            },
            {
                time: "9:00 PM",
                label: "Wrap Up",
                details: "Takeaway and farewell.",
            },
        ],
    },
] as const;

const AMENITIES = [
    { label: "Seasonal Fruits", shortLabel: "Fruit" },
    { label: "Dinner at 8 PM", shortLabel: "Dinner" },
    { label: "Parking Available", shortLabel: "Parking" },
    { label: "Cheese Tasting", shortLabel: "Cheese" },
    { label: "Estate Tour", shortLabel: "Tour" },
    { label: "Takeaway Included", shortLabel: "Takeaway" },
];

const VENUE_DETAILS = [
    { label: "Where", value: "The Yellow Slice, Pirangut, Pune, Maharashtra" },
    { label: "When", value: "9th & 10th May 2026 | 5:00 PM to 9:00 PM" },
    { label: "Dinner", value: "Dinner served at 8:00 PM" },
    { label: "Parking", value: "Parking available on-site" },
];

const CONTACT_OPTIONS = [
    {
        label: "Call",
        title: "Call Us",
        value: "+91 70284 78109",
        href: "tel:+917028478109",
    },
    {
        label: "Instagram",
        title: "Instagram",
        value: "@only_workshops",
        href: "https://www.instagram.com/only_workshops?igsh=MjF1bHY2NHNxc2J3",
        external: true,
    },
    {
        label: "Email",
        title: "Email",
        value: "reachonlyworkshops@gmail.com",
        href: "mailto:reachonlyworkshops@gmail.com",
    },
] as const;

const REGISTRATION_FORM_ID = "16qtxFn5PkQNbDQrZ-HJ154Ap0GibS5qg_XXsc19bzvk";
const REGISTRATION_FORM_URL = `https://docs.google.com/forms/d/${REGISTRATION_FORM_ID}/viewform`;
const REGISTRATION_FORM_EMBED_URL = `${REGISTRATION_FORM_URL}?embedded=true`;
const BROCHURE_URL = "/special-pages/summer-family-retreat/summer-family-retreat.pdf";
const BROCHURE_DOWNLOAD_NAME = "Summer Special Family Retreat.pdf";

const REGISTRATION_TIPS = [
    {
        label: "In-page access",
        text: "Complete the Google Form directly on this page without losing your place.",
    },
    {
        label: "Open separately",
        text: "If the embed feels tighter on mobile, continue in a dedicated browser tab.",
    },
    {
        label: "Review details",
        text: "Keep the updated brochure nearby while you look through the retreat schedule.",
    },
] as const;

export default function SummerRetreatClient() {
    const router = useRouter();
    const [activeDay, setActiveDay] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const activeProgram = DAY_PROGRAMS[activeDay] ?? DAY_PROGRAMS[0];

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("sr-vis");
                        observer.unobserve(entry.target);
                    }
                });
            },
            { threshold: 0.1 }
        );

        const elements = wrapRef.current?.querySelectorAll(".sr-rev");
        elements?.forEach((element) => observer.observe(element));

        return () => observer.disconnect();
    }, []);

    return (
        <div className="summer-retreat">
            <div className="sr-bg-fixed" aria-hidden="true">
                <Image
                    src="/special-pages/summer-family-retreat/background.webp"
                    alt=""
                    fill
                    priority
                    quality={72}
                    sizes="100vw"
                    placeholder="blur"
                    blurDataURL={BACKGROUND_BLUR_DATA_URL}
                    className="sr-bg-media"
                />
            </div>

            <button onClick={() => router.back()} className="sr-back-btn" aria-label="Go back">
                <ArrowLeft size={18} />
                Back
            </button>

            <div className="sr-wrap" ref={wrapRef}>
                <button
                    onClick={() => router.back()}
                    className="sr-back-btn-mobile"
                    aria-label="Go back"
                >
                    <ArrowLeft size={16} />
                    Back
                </button>

                <section className="sr-hero">
                    <div className="sr-hero-inner">
                        <span className="sr-eyebrow">A one-of-a-kind weekend experience</span>
                        <h1 className="sr-hero-title">
                            Summer Special
                            <br />
                            <em>Family Retreat</em>
                        </h1>
                        <p className="sr-hero-sub">Only Workshops x The Yellow Slice</p>

                        <div className="sr-logos-row">
                            <div className="sr-logo-ow">
                                <Image
                                    src="/special-pages/summer-family-retreat/onlyworkshop-logo.png"
                                    alt="Only Workshops"
                                    width={320}
                                    height={320}
                                    priority
                                    sizes="(max-width: 768px) 56px, 110px"
                                />
                            </div>
                            <span className="sr-logo-x">&times;</span>
                            <div className="sr-logo-tys">
                                <Image
                                    src="/special-pages/summer-family-retreat/yellow-slice-logo.png"
                                    alt="The Yellow Slice"
                                    width={360}
                                    height={108}
                                    priority
                                    sizes="(max-width: 768px) 160px, 220px"
                                />
                            </div>
                        </div>

                        <div className="sr-pills">
                            {HERO_PILLS.map((pill) => (
                                <div key={pill} className="sr-pill">
                                    {pill}
                                </div>
                            ))}
                        </div>

                        <a
                            href="#programme"
                            className="sr-cta"
                            onClick={(event) => {
                                event.preventDefault();
                                document
                                    .getElementById("programme")
                                    ?.scrollIntoView({ behavior: "smooth" });
                            }}
                        >
                            Explore the Weekend <span className="sr-arrow">&darr;</span>
                        </a>
                    </div>
                </section>

                <section className="sr-sec">
                    <div className="sr-inner sr-rev">
                        <span className="sr-lbl" style={{ color: "var(--amber)" }}>
                            Pune Special Event
                        </span>
                        <div
                            className="sr-rule"
                            style={{
                                background: "linear-gradient(to right, var(--amber), transparent)",
                            }}
                        />
                        <h2 className="sr-hdg sr-hdg-lt">
                            The Ultimate <em>Pune Special Event</em>
                            <br />
                            for Parents and Children
                        </h2>
                        <div
                            className="sr-seo-content sr-rev"
                            style={{
                                marginTop: 28,
                                padding: "clamp(24px, 4vw, 40px)",
                                background: "rgba(255, 253, 247, 0.04)",
                                borderRadius: "24px",
                                border: "1px solid rgba(245, 166, 35, 0.15)",
                                backdropFilter: "blur(12px)",
                            }}
                        >
                            <p
                                className="sr-body sr-body-lt"
                                style={{ marginBottom: 16, fontSize: "clamp(14px, 1.6vw, 17px)" }}
                            >
                                If you are searching for a{" "}
                                <strong>Pune special event for parents and child</strong>, this
                                Summer Family Retreat is the perfect weekend getaway. Located at the
                                scenic Yellow Slice in Pirangut, it is designed to offer engaging
                                activities for children and a relaxing retreat for parents.
                            </p>
                            <p
                                className="sr-body sr-body-lt"
                                style={{ marginBottom: 20, fontSize: "clamp(14px, 1.6vw, 17px)" }}
                            >
                                Skip the crowded malls and generic play zones. This is a{" "}
                                <strong>trending family experience in Pune</strong> where your kids
                                can learn future-ready skills like drone building and professional
                                baking, while parents unwind with artisan cheese tasting and curated
                                estate tours.
                            </p>
                            <div
                                className="sr-pills"
                                style={{ marginTop: 0, justifyContent: "flex-start" }}
                            >
                                {[
                                    "#PuneFamilyEvents",
                                    "#ParentChildActivities",
                                    "#PuneSummerRetreat",
                                    "#KidsWorkshopsPune",
                                    "#WeekendGetawayPune",
                                ].map((tag) => (
                                    <span
                                        key={tag}
                                        className="sr-pill"
                                        style={{
                                            padding: "6px 14px",
                                            fontSize: "11px",
                                            background: "rgba(245, 166, 35, 0.08)",
                                            border: "1px solid rgba(245, 166, 35, 0.2)",
                                        }}
                                    >
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="sr-sec">
                    <div className="sr-inner sr-rev">
                        <span className="sr-lbl" style={{ color: "var(--amber)" }}>
                            About the Event
                        </span>
                        <div
                            className="sr-rule"
                            style={{
                                background: "linear-gradient(to right, var(--amber), transparent)",
                            }}
                        />
                        <h2 className="sr-hdg sr-hdg-lt">
                            Where families come together
                            <br />
                            <em>to create, explore, and savour.</em>
                        </h2>
                        <div className="sr-about-grid" style={{ marginTop: 28 }}>
                            <div className="sr-a-card sr-rev">
                                <span className="sr-tag sr-tag-a">For the Kids</span>
                                <h3>Hands-On Learning</h3>
                                <p className="sr-body">
                                    Two standout workshops across the weekend give children a real
                                    hands-on experience: drone building on one evening and iced
                                    cakesicle crafting on the next. Every session is built to spark
                                    creativity, confidence, and a proud take-home result.
                                </p>
                            </div>
                            <div className="sr-a-card sr-rev" style={{ transitionDelay: "0.1s" }}>
                                <span className="sr-tag sr-tag-g">For the Parents</span>
                                <h3>An Evening to Unwind</h3>
                                <p className="sr-body">
                                    While the kids are in their workshop, parents enjoy a curated
                                    estate experience at The Yellow Slice with cheese tasting,
                                    seasonal fruits, a guided tour, and a sit-down dinner. It is a
                                    family outing that feels special from start to finish.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="sr-sec sr-fmt" id="programme">
                    <div className="sr-inner">
                        <span className="sr-lbl sr-rev">Event Programme</span>
                        <div className="sr-rule" />
                        <h2 className="sr-hdg sr-hdg-lt sr-rev">
                            Two Days. <em>Endless Memories.</em>
                        </h2>
                        <p
                            className="sr-body sr-body-lt sr-rev"
                            style={{ maxWidth: 580, marginTop: 10 }}
                        >
                            Each evening features a different kids workshop while the parents&apos;
                            experience runs alongside it on both days.
                        </p>

                        <div className="sr-tabs sr-rev">
                            {DAY_PROGRAMS.map((program, index) => (
                                <button
                                    key={program.tabLabel}
                                    className={`sr-tab ${activeDay === index ? "sr-on" : ""}`}
                                    onClick={() => setActiveDay(index)}
                                >
                                    {program.tabLabel}
                                </button>
                            ))}
                        </div>

                        <div className="sr-day sr-on">
                            <div className="sr-ws-grid">
                                <div className="sr-ws-card">
                                    <span className="sr-ws-icon">Kids</span>
                                    <div className="sr-ws-by">{activeProgram.byline}</div>
                                    <h3>{activeProgram.title}</h3>
                                    <p>{activeProgram.description}</p>
                                    <div className="sr-ws-meta">
                                        {activeProgram.badges.map((badge) => (
                                            <span key={badge} className="sr-badge">
                                                {badge}
                                            </span>
                                        ))}
                                    </div>
                                </div>

                                <div className="sr-ws-card">
                                    <div className="sr-ws-by" style={{ marginBottom: 12 }}>
                                        {activeProgram.scheduleLabel}
                                    </div>
                                    <div className="sr-tl">
                                        {activeProgram.timeline.map((item) => (
                                            <div
                                                key={`${item.time}-${item.label}`}
                                                className="sr-ti"
                                            >
                                                <div className="sr-ti-t">{item.time}</div>
                                                <div className="sr-ti-l">{item.label}</div>
                                                <div className="sr-ti-d">{item.details}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="sr-p-band">
                                <span className="sr-pe">Parents</span>
                                <div>
                                    <h3>{PARENT_EXPERIENCE.title}</h3>
                                    <p>{PARENT_EXPERIENCE.description}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="sr-sec">
                    <div className="sr-inner">
                        <div className="sr-am-inner sr-rev">
                            <span className="sr-lbl">Everything Included</span>
                            <div className="sr-rule" />
                            <h2 className="sr-hdg">
                                A Complete Evening, <em>Taken Care Of.</em>
                            </h2>
                            <div className="sr-am-grid sr-stagger">
                                {AMENITIES.map((item, index) => (
                                    <div
                                        key={item.label}
                                        className="sr-am-item sr-rev"
                                        style={{ transitionDelay: `${index * 0.07}s` }}
                                    >
                                        <div className="sr-ai">{item.shortLabel}</div>
                                        <p>{item.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="sr-sec" style={{ paddingTop: 0 }}>
                    <div className="sr-inner">
                        <div className="sr-venue-inner sr-rev">
                            <div>
                                <span className="sr-lbl">Venue</span>
                                <div
                                    className="sr-rule"
                                    style={{
                                        background:
                                            "linear-gradient(to right, var(--amber), transparent)",
                                    }}
                                />
                                <h2 className="sr-hdg" style={{ color: "var(--sr-cream)" }}>
                                    The Yellow Slice,
                                    <br />
                                    <em>Pirangut, Pune</em>
                                </h2>
                                <p className="sr-body sr-body-lt" style={{ marginTop: 14 }}>
                                    An artisan cheese estate on the outskirts of Pune, The Yellow
                                    Slice gives the retreat its signature atmosphere with open
                                    grounds, a working dairy, and a setting that feels far from the
                                    city without leaving the region.
                                </p>
                                <ul className="sr-vlist">
                                    {VENUE_DETAILS.map((item) => (
                                        <li key={item.label}>
                                            <span className="sr-vi">{item.label}</span>
                                            <span>{item.value}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="sr-vmap">
                                <span className="sr-vi">Map</span>
                                <span>
                                    The Yellow Slice
                                    <br />
                                    Pirangut, Pune
                                </span>
                                <a
                                    href="https://maps.google.com/?q=The+Yellow+Slice+Pirangut+Pune"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        color: "var(--amber)",
                                        fontWeight: 600,
                                        fontSize: 12,
                                        textDecoration: "none",
                                        marginTop: 4,
                                    }}
                                >
                                    Open in Google Maps &rarr;
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="sr-sec">
                    <div className="sr-inner">
                        <div className="sr-con-inner sr-rev">
                            <span className="sr-lbl">Get In Touch</span>
                            <div className="sr-rule" style={{ margin: "10px auto 18px" }} />
                            <h2 className="sr-hdg">
                                Questions? <em>We&apos;d love to hear from you.</em>
                            </h2>
                            <p
                                className="sr-body"
                                style={{
                                    marginTop: 12,
                                    maxWidth: 460,
                                    marginLeft: "auto",
                                    marginRight: "auto",
                                }}
                            >
                                Reach out by phone, Instagram, or email if you want help with the
                                event, the venue, or booking details.
                            </p>
                            <div className="sr-con-grid">
                                {CONTACT_OPTIONS.map((option) => (
                                    <a
                                        key={option.title}
                                        href={option.href}
                                        target={"external" in option ? "_blank" : undefined}
                                        rel={
                                            "external" in option ? "noopener noreferrer" : undefined
                                        }
                                        className="sr-con-card"
                                    >
                                        <div className="sr-ci">{option.label}</div>
                                        <div className="sr-cl">{option.title}</div>
                                        <div className="sr-cv">{option.value}</div>
                                    </a>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <section className="sr-sec" id="registration">
                    <div className="sr-inner">
                        <div className="sr-form-shell sr-rev">
                            <div className="sr-form-copy">
                                <span className="sr-lbl" style={{ color: "var(--amber)" }}>
                                    Registration
                                </span>
                                <div
                                    className="sr-rule"
                                    style={{
                                        background:
                                            "linear-gradient(to right, var(--amber), transparent)",
                                    }}
                                />
                                <h2 className="sr-hdg sr-hdg-lt">
                                    Reserve your family&apos;s place
                                    <br />
                                    <em>right from this page.</em>
                                </h2>
                                <p
                                    className="sr-body sr-body-lt"
                                    style={{ maxWidth: 500, marginTop: 14 }}
                                >
                                    Fill in the Google Form below to register for the Summer Special
                                    Family Retreat. If the embed does not load cleanly, open the
                                    form in a new tab and continue there.
                                </p>

                                <div className="sr-form-points">
                                    {REGISTRATION_TIPS.map((tip) => (
                                        <div key={tip.label} className="sr-form-point">
                                            <span className="sr-form-point-label">{tip.label}</span>
                                            <p>{tip.text}</p>
                                        </div>
                                    ))}
                                </div>

                                <div className="sr-form-actions">
                                    <a
                                        href={REGISTRATION_FORM_URL}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="sr-form-cta sr-form-cta-primary"
                                    >
                                        Open Form in New Tab
                                    </a>
                                    <a
                                        href={BROCHURE_URL}
                                        download={BROCHURE_DOWNLOAD_NAME}
                                        className="sr-form-cta sr-form-cta-secondary"
                                    >
                                        Download Updated Brochure
                                    </a>
                                </div>
                            </div>

                            <div
                                className="sr-form-panel sr-rev"
                                style={{ transitionDelay: "0.08s" }}
                            >
                                <div className="sr-form-panel-head">
                                    <span className="sr-form-kicker">Google Form</span>
                                    <span className="sr-form-state">
                                        Embedded with external fallback
                                    </span>
                                </div>
                                <iframe
                                    title="Summer Special Family Retreat registration form"
                                    src={REGISTRATION_FORM_EMBED_URL}
                                    className="sr-form-frame"
                                    loading="lazy"
                                    referrerPolicy="strict-origin-when-cross-origin"
                                />
                            </div>
                        </div>
                    </div>
                </section>

                <div className="sr-event-footer">
                    <div className="sr-ft-logos">
                        <div className="sr-fl-ow">
                            <Image
                                src="/special-pages/summer-family-retreat/onlyworkshop-logo.png"
                                alt="Only Workshops"
                                width={96}
                                height={96}
                                sizes="34px"
                            />
                        </div>
                        <span className="sr-fx">&times;</span>
                        <div className="sr-fl-tys">
                            <Image
                                src="/special-pages/summer-family-retreat/yellow-slice-logo.png"
                                alt="The Yellow Slice"
                                width={180}
                                height={56}
                                sizes="120px"
                            />
                        </div>
                    </div>
                    <p>© 2026 Only Workshops &amp; The Yellow Slice | Summer Family Retreat</p>
                    <p style={{ marginTop: 5 }}>
                        Queries: <a href="tel:+917028478109">+91 70284 78109</a>
                        {"\u00A0"}|{"\u00A0"}
                        <a href="mailto:reachonlyworkshops@gmail.com">
                            reachonlyworkshops@gmail.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
