import StaticPage from "@/components/StaticPage";

export default function TermsPage() {
    return (
        <StaticPage
            title="Terms of Service"
            description="These terms govern your use of Only Workshop."
        >
            <section>
                <h2 className="heading-sm mb-2">1. Booking and Attendance</h2>
                <p>
                    Workshop spots are confirmed only after successful payment. Hosts may
                    enforce venue rules and age restrictions.
                </p>
            </section>
            <section>
                <h2 className="heading-sm mb-2">2. User Accounts</h2>
                <p>
                    You are responsible for keeping your account credentials secure and for
                    activities performed using your account.
                </p>
            </section>
            <section>
                <h2 className="heading-sm mb-2">3. Liability</h2>
                <p>
                    Only Workshop acts as a platform between hosts and attendees. Hosts are
                    responsible for workshop delivery and on-site safety compliance.
                </p>
            </section>
        </StaticPage>
    );
}
