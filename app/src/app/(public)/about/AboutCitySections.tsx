import Link from "next/link";
import { topicCountText, type AboutTopicLink } from "@/lib/about-stats";

/*
 * The /about sections built from live workshop rows. Server components: the copy arrives as
 * HTML, with no client JavaScript of its own. The page renders them only when the read worked.
 */

export const ABOUT_LINK_CLASS = "font-semibold text-terracotta hover:underline";

export function HostedSection({
    cityName,
    summary,
    topics,
}: {
    cityName: string;
    /** hostedSentence(): counts from the data, never typed in. */
    summary: string;
    topics: AboutTopicLink[];
}) {
    return (
        <section>
            {/* One string, so the heading is a single text node in the HTML. */}
            <h2 className="heading-sm mb-2">{`Our Workshops in ${cityName}`}</h2>
            {summary && <p>{summary}</p>}
            {topics.length > 0 && (
                <>
                    <p className="mt-3">
                        Each activity has its own page, with its dates, what a session covers and
                        answers to common questions:
                    </p>
                    <ul className="mt-3 grid grid-cols-1 gap-3 font-inter sm:grid-cols-2">
                        {topics.map((topic) => (
                            <li key={topic.slug}>
                                <Link href={topic.href} className={ABOUT_LINK_CLASS}>
                                    {topic.label}
                                </Link>
                                <span className="block text-sm text-dark-muted">
                                    {topicCountText(topic)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </section>
    );
}

export function WhereSection({
    cityName,
    sentence,
}: {
    cityName: string;
    /** whereSentence(): areas and venue names the rows themselves state. */
    sentence: string;
}) {
    return (
        <section>
            <h2 className="heading-sm mb-2">{`Where Our ${cityName} Workshops Take Place`}</h2>
            <p>{sentence}</p>
            <p className="mt-3">Each workshop&apos;s page shows its venue on a map.</p>
        </section>
    );
}
