"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import "./summer-retreat.css";

export default function SummerRetreatClient() {
    const router = useRouter();
    const [activeDay, setActiveDay] = useState(0);
    const [isMobile, setIsMobile] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

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
        elements?.forEach((el) => observer.observe(el));

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const checkMobile = () => setIsMobile(window.innerWidth <= 768);
        checkMobile();
        window.addEventListener("resize", checkMobile);
        return () => window.removeEventListener("resize", checkMobile);
    }, []);

    return (
        <div className="summer-retreat">
            {/* Fixed blurred background — z-0 so navbar (z-80) stays on top */}
            <div className="sr-bg-fixed" />

            {/* Back button — fixed on desktop, relative on mobile */}
            {!isMobile && (
                <button onClick={() => router.back()} className="sr-back-btn" aria-label="Go back">
                    <ArrowLeft size={18} />
                    Back
                </button>
            )}

            <div className="sr-wrap" ref={wrapRef}>
                {/* Mobile back button — relative, inside the scroll wrapper */}
                {isMobile && (
                    <button
                        onClick={() => router.back()}
                        className="sr-back-btn-mobile"
                        aria-label="Go back"
                    >
                        <ArrowLeft size={16} />
                        Back
                    </button>
                )}
                {/* ══ HERO ══ */}
                <section className="sr-hero">
                    <div className="sr-hero-inner">
                        <span className="sr-eyebrow">✦ A One-of-a-Kind Weekend Experience ✦</span>
                        <h1 className="sr-hero-title">
                            Summer Special
                            <br />
                            <em>Family Retreat</em>
                        </h1>
                        <p className="sr-hero-sub">
                            Only Workshops{"\u00A0"}×{"\u00A0"}The Yellow Slice
                        </p>

                        <div className="sr-logos-row">
                            <div className="sr-logo-ow">
                                <img
                                    src="/special-pages/summer-family-retreat/onlyworkshop-logo.png"
                                    alt="Only Workshops"
                                />
                            </div>
                            <span className="sr-logo-x">×</span>
                            <div className="sr-logo-tys">
                                <img
                                    src="/special-pages/summer-family-retreat/yellow-slice-logo.png"
                                    alt="The Yellow Slice"
                                />
                            </div>
                        </div>

                        <div className="sr-pills">
                            <div className="sr-pill">📅 9th &amp; 10th May 2026</div>
                            <div className="sr-pill">🕔 5 PM – 9 PM</div>
                            <div className="sr-pill">📍 The Yellow Slice, Pirangut</div>
                            <div className="sr-pill">👨‍👩‍👧 1 Child + 1 Parent</div>
                        </div>

                        <a
                            href="#programme"
                            className="sr-cta"
                            onClick={(e) => {
                                e.preventDefault();
                                document
                                    .getElementById("programme")
                                    ?.scrollIntoView({ behavior: "smooth" });
                            }}
                        >
                            Explore the Weekend <span className="sr-arrow">↓</span>
                        </a>
                    </div>
                </section>

                {/* ══ ABOUT ══ */}
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
                            <em>to create, explore &amp; savour.</em>
                        </h2>
                        <div className="sr-about-grid" style={{ marginTop: 28 }}>
                            <div className="sr-a-card sr-rev">
                                <span className="sr-tag sr-tag-a">For the Kids</span>
                                <h3>Hands-On Learning</h3>
                                <p className="sr-body">
                                    Two big workshops across the weekend — one day of drone building
                                    with DroneAcharya, and one day of iced cakesicle crafting with
                                    Elevora Baking Academy. Each session is designed to spark
                                    creativity, build real skills, and end with a proud take-home
                                    creation.
                                </p>
                            </div>
                            <div className="sr-a-card sr-rev" style={{ transitionDelay: "0.1s" }}>
                                <span className="sr-tag sr-tag-g">For the Parents</span>
                                <h3>An Evening to Unwind</h3>
                                <p className="sr-body">
                                    While the kids are at their workshops, parents enjoy an
                                    exclusive Cheese Tasting &amp; Estate Tour at The Yellow Slice —
                                    a beautifully curated evening of artisan cheeses, seasonal
                                    fruits, a sit-down dinner at 8 PM, and a guided walk through the
                                    estate. Both days. Every evening.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ══ PROGRAMME ══ */}
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
                            Each day runs a different workshop for children while the parents&apos;
                            experience runs simultaneously on both evenings.
                        </p>

                        <div className="sr-tabs sr-rev">
                            <button
                                className={`sr-tab ${activeDay === 0 ? "sr-on" : ""}`}
                                onClick={() => setActiveDay(0)}
                            >
                                Day 1{!isMobile && " · May 9th"}
                            </button>
                            <button
                                className={`sr-tab ${activeDay === 1 ? "sr-on" : ""}`}
                                onClick={() => setActiveDay(1)}
                            >
                                Day 2{!isMobile && " · May 10th"}
                            </button>
                        </div>

                        {/* DAY 1 */}
                        <div className={`sr-day ${activeDay === 0 ? "sr-on" : ""}`}>
                            <div className="sr-ws-grid">
                                <div className="sr-ws-card">
                                    <span className="sr-ws-icon">🚁</span>
                                    <div className="sr-ws-by">
                                        DroneAcharya — Aerial Innovations
                                    </div>
                                    <h3>Drone Making Workshop</h3>
                                    <p>
                                        Students from Grades 7–10 assemble, program, and fly their
                                        own drone from scratch — guided step-by-step by experts in
                                        aeronautics. A deep dive into aerodynamics, electronics, and
                                        the future of technology. Takeaway included.
                                    </p>
                                    <div className="sr-ws-meta">
                                        <span className="sr-badge">🎓 Grades 7–10</span>
                                        <span className="sr-badge">🕔 5 PM – 9 PM</span>
                                        <span className="sr-badge">🚀 Fly Your Own Drone</span>
                                        <span className="sr-badge">🎁 Takeaway Included</span>
                                    </div>
                                </div>
                                <div className="sr-ws-card">
                                    <div className="sr-ws-by" style={{ marginBottom: 12 }}>
                                        Schedule · Day 1 · 9th May
                                    </div>
                                    <div className="sr-tl">
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">5:00 PM</div>
                                            <div className="sr-ti-l">
                                                Arrival &amp; Registration
                                            </div>
                                            <div className="sr-ti-d">
                                                Welcome, check-in, meet fellow families
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">5:30 PM</div>
                                            <div className="sr-ti-l">Drone Workshop Begins</div>
                                            <div className="sr-ti-d">
                                                Kids start building; parents head to the estate tour
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">7:30 PM</div>
                                            <div className="sr-ti-l">Cheese Tasting</div>
                                            <div className="sr-ti-d">
                                                Artisan cheese &amp; seasonal fruits for parents
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">8:00 PM</div>
                                            <div className="sr-ti-l">Dinner</div>
                                            <div className="sr-ti-d">
                                                Sit-down dinner for all families
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">8:30 PM</div>
                                            <div className="sr-ti-l">
                                                Grand Fly-Off &amp; Showcase
                                            </div>
                                            <div className="sr-ti-d">
                                                Drone flights, photos, certificates
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">9:00 PM</div>
                                            <div className="sr-ti-l">Wrap Up</div>
                                            <div className="sr-ti-d">Takeaway &amp; farewell</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="sr-p-band">
                                <span className="sr-pe">🧀</span>
                                <div>
                                    <h3>Cheese Tasting &amp; Estate Tour · For Parents</h3>
                                    <p>
                                        Hosted by The Yellow Slice, Pirangut — parents enjoy a
                                        guided walk through the cheese-making estate, a curated
                                        cheese board, seasonal fruits, and a sit-down dinner at 8
                                        PM. A rare, indulgent evening in Pune&apos;s finest artisan
                                        setting.
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* DAY 2 */}
                        <div className={`sr-day ${activeDay === 1 ? "sr-on" : ""}`}>
                            <div className="sr-ws-grid">
                                <div className="sr-ws-card">
                                    <span className="sr-ws-icon">🍰</span>
                                    <div className="sr-ws-by">Elevora Baking Academy</div>
                                    <h3>Iced Cakesicles Workshop</h3>
                                    <p>
                                        Kids aged 10+ create stunning decorated iced cakesicles from
                                        scratch — combining baking science with edible artistry.
                                        They&apos;ll learn chocolate tempering, moulding, and piping
                                        under expert guidance. Every child takes home their
                                        creations.
                                    </p>
                                    <div className="sr-ws-meta">
                                        <span className="sr-badge">👧 Ages 10+</span>
                                        <span className="sr-badge">🕔 5 PM – 9 PM</span>
                                        <span className="sr-badge">🎂 Take-Home Creation</span>
                                        <span className="sr-badge">🎁 Takeaway Included</span>
                                    </div>
                                </div>
                                <div className="sr-ws-card">
                                    <div className="sr-ws-by" style={{ marginBottom: 12 }}>
                                        Schedule · Day 2 · 10th May
                                    </div>
                                    <div className="sr-tl">
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">5:00 PM</div>
                                            <div className="sr-ti-l">
                                                Arrival &amp; Registration
                                            </div>
                                            <div className="sr-ti-d">
                                                Welcome, check-in, meet fellow families
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">5:30 PM</div>
                                            <div className="sr-ti-l">
                                                Cakesicles Workshop Begins
                                            </div>
                                            <div className="sr-ti-d">
                                                Kids start baking; parents explore the estate
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">7:30 PM</div>
                                            <div className="sr-ti-l">Cheese Tasting</div>
                                            <div className="sr-ti-d">
                                                Artisan cheese &amp; seasonal fruits for parents
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">8:00 PM</div>
                                            <div className="sr-ti-l">Dinner</div>
                                            <div className="sr-ti-d">
                                                Sit-down dinner for all families
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">8:30 PM</div>
                                            <div className="sr-ti-l">
                                                Showcase &amp; Photo Moment
                                            </div>
                                            <div className="sr-ti-d">
                                                Kids present their cakesicles, family photos
                                            </div>
                                        </div>
                                        <div className="sr-ti">
                                            <div className="sr-ti-t">9:00 PM</div>
                                            <div className="sr-ti-l">Wrap Up</div>
                                            <div className="sr-ti-d">Takeaway &amp; farewell</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="sr-p-band">
                                <span className="sr-pe">🧀</span>
                                <div>
                                    <h3>Cheese Tasting &amp; Estate Tour · For Parents</h3>
                                    <p>
                                        Hosted by The Yellow Slice, Pirangut — parents enjoy a
                                        guided walk through the cheese-making estate, a curated
                                        cheese board, seasonal fruits, and a sit-down dinner at 8
                                        PM. A rare, indulgent evening in Pune&apos;s finest artisan
                                        setting.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ══ AMENITIES ══ */}
                <section className="sr-sec">
                    <div className="sr-inner">
                        <div className="sr-am-inner sr-rev">
                            <span className="sr-lbl">Everything Included</span>
                            <div className="sr-rule" />
                            <h2 className="sr-hdg">
                                A Complete Evening, <em>Taken Care Of.</em>
                            </h2>
                            <div className="sr-am-grid sr-stagger">
                                <div className="sr-am-item sr-rev">
                                    <div className="sr-ai">🍉</div>
                                    <p>Seasonal Fruits</p>
                                </div>
                                <div
                                    className="sr-am-item sr-rev"
                                    style={{ transitionDelay: "0.07s" }}
                                >
                                    <div className="sr-ai">🍽️</div>
                                    <p>Dinner at 8 PM</p>
                                </div>
                                <div
                                    className="sr-am-item sr-rev"
                                    style={{ transitionDelay: "0.14s" }}
                                >
                                    <div className="sr-ai">🅿️</div>
                                    <p>Parking Available</p>
                                </div>
                                <div
                                    className="sr-am-item sr-rev"
                                    style={{ transitionDelay: "0.21s" }}
                                >
                                    <div className="sr-ai">🧀</div>
                                    <p>Cheese Tasting</p>
                                </div>
                                <div
                                    className="sr-am-item sr-rev"
                                    style={{ transitionDelay: "0.28s" }}
                                >
                                    <div className="sr-ai">🏡</div>
                                    <p>Estate Tour</p>
                                </div>
                                <div
                                    className="sr-am-item sr-rev"
                                    style={{ transitionDelay: "0.35s" }}
                                >
                                    <div className="sr-ai">🎁</div>
                                    <p>Takeaway Included</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ══ VENUE ══ */}
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
                                    An artisan cheese estate nestled in the lush outskirts of Pune —
                                    with a working dairy, open grounds, and an atmosphere unlike
                                    anything in the city. The perfect setting for a summer family
                                    evening.
                                </p>
                                <ul className="sr-vlist">
                                    <li>
                                        <span className="sr-vi">📍</span>
                                        <span>The Yellow Slice, Pirangut, Pune, Maharashtra</span>
                                    </li>
                                    <li>
                                        <span className="sr-vi">📅</span>
                                        <span>9th &amp; 10th May 2026 · 5:00 PM to 9:00 PM</span>
                                    </li>
                                    <li>
                                        <span className="sr-vi">🍽️</span>
                                        <span>Dinner served at 8:00 PM</span>
                                    </li>
                                    <li>
                                        <span className="sr-vi">🅿️</span>
                                        <span>Parking available on-site</span>
                                    </li>
                                </ul>
                            </div>
                            <div className="sr-vmap">
                                <span style={{ fontSize: 36 }}>🗺️</span>
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
                                    Open in Google Maps →
                                </a>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ══ CONTACT ══ */}
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
                                Reach out via call, Instagram, or email — we&apos;re happy to help
                                you sign up and answer any questions.
                            </p>
                            <div className="sr-con-grid">
                                <a href="tel:+917028478109" className="sr-con-card">
                                    <div className="sr-ci">📞</div>
                                    <div className="sr-cl">Call Us</div>
                                    <div className="sr-cv">+91 70284 78109</div>
                                </a>
                                <a
                                    href="https://www.instagram.com/only_workshops?igsh=MjF1bHY2NHNxc2J3"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="sr-con-card"
                                >
                                    <div className="sr-ci">📸</div>
                                    <div className="sr-cl">Instagram</div>
                                    <div className="sr-cv">@only_workshops</div>
                                </a>
                                <a
                                    href="mailto:reachonlyworkshops@gmail.com"
                                    className="sr-con-card"
                                >
                                    <div className="sr-ci">✉️</div>
                                    <div className="sr-cl">Email</div>
                                    <div className="sr-cv">reachonlyworkshops@gmail.com</div>
                                </a>
                            </div>
                            <a
                                href="/special-pages/summer-family-retreat/summer-family-retreat.pdf"
                                download="Summer Special Family Retreat.pdf"
                                className="sr-pdf-btn"
                            >
                                📄 Download Full Event Brochure
                            </a>
                        </div>
                    </div>
                </section>

                {/* ══ EVENT FOOTER (collab branding) ══ */}
                <div className="sr-event-footer">
                    <div className="sr-ft-logos">
                        <div className="sr-fl-ow">
                            <img
                                src="/special-pages/summer-family-retreat/onlyworkshop-logo.png"
                                alt="Only Workshops"
                            />
                        </div>
                        <span className="sr-fx">×</span>
                        <div className="sr-fl-tys">
                            <img
                                src="/special-pages/summer-family-retreat/yellow-slice-logo.png"
                                alt="The Yellow Slice"
                            />
                        </div>
                    </div>
                    <p>
                        © 2026 Only Workshops &amp; The Yellow Slice · Summer Special Family Retreat
                        · Pirangut, Pune
                    </p>
                    <p style={{ marginTop: 5 }}>
                        Queries: <a href="tel:+917028478109">+91 70284 78109</a>
                        {"\u00A0"}·{"\u00A0"}
                        <a href="mailto:reachonlyworkshops@gmail.com">
                            reachonlyworkshops@gmail.com
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
}
