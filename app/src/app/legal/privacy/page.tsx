import StaticPage from "@/components/StaticPage";

export default function PrivacyPage() {
    return (
        <StaticPage
            title="Privacy Policy"
            description="How OnlyWorkshop collects, uses, and protects your data."
        >
            <section>
                <h2 className="heading-sm mb-2">Data We Collect</h2>
                <p>
                    We collect account details, booking information, and support requests to
                    provide our services.
                </p>
            </section>
            <section>
                <h2 className="heading-sm mb-2">How We Use Data</h2>
                <p>
                    Your data is used to authenticate users, process bookings, and provide
                    customer support.
                </p>
            </section>
            <section>
                <h2 className="heading-sm mb-2">Data Rights</h2>
                <p>
                    You may request access, correction, or deletion of your personal data by
                    contacting our support team.
                </p>
            </section>
        </StaticPage>
    );
}
