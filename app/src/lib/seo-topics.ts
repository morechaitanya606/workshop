import type { Workshop } from "@/lib/data";
import { getSeoCityByName, type SeoCity } from "@/lib/seo";

/*
 * Activity ("topic") landing pages: /workshops/<city>/<topic>. Kept apart from lib/seo.ts on
 * purpose: the intros, FAQs and meta copy below are only needed by server pages and the sitemap,
 * and lib/seo.ts is imported by client components (cards, workshop page), so anything in it
 * ships in phone JavaScript. Client components get ready-made { name, href } links instead.
 */

export type SeoTopicFaq = { question: string; answer: string };

export type SeoTopic = {
    /** URL segment of /workshops/<city>/<slug>. A live slug is a URL: never rename it. */
    slug: string;
    /** Activity name for breadcrumbs, chips and headings ("Upcoming {name} workshops in Pune"). */
    name: string;
    /** Descriptive anchor text for links to the page from elsewhere on the site. */
    linkLabel: string;
    h1: string;
    /** The full <title>: at most 60 characters and always naming Pune. */
    metaTitle: string;
    /** ~150 characters. */
    metaDescription: string;
    /**
     * Hand-written, evergreen paragraphs: true for every session, so no counts, venues or dates.
     * The first sentence stands alone, so it can be reused as a one-line summary.
     */
    intro: string[];
    /** Tested against the title only: descriptions mention other things (the babka one says chocolate). */
    titlePattern: RegExp;
    /** `workshops.category` values (any case) that belong here whatever the title says. */
    categories?: string[];
    /** Hub pages: also list every workshop that matches these topic slugs. */
    includeTopics?: string[];
    /** Manual overrides by workshop id, for titles the pattern reads wrongly. */
    includeIds?: string[];
    excludeIds?: string[];
    /** Topic slugs to link from this page. */
    related: string[];
    /** Candidate for a site-wide footer link. */
    footer?: boolean;
    /** Questions about the activity itself; the page adds the ones built from live data. */
    faqs?: SeoTopicFaq[];
};

/**
 * Activity pages under /workshops/<city>/<slug>. Specific topics come first: the first match is
 * a workshop's primary topic (its breadcrumb and "more like this" link), so the broad `baking`
 * and `cooking-classes` hubs stay last. Title patterns tolerate the spellings in live data
 * ("Choclate", "Macron", "Foccacia").
 */
export const SEO_TOPICS: readonly SeoTopic[] = [
    {
        slug: "chocolate-making",
        name: "Chocolate Making",
        linkLabel: "Chocolate making workshop",
        h1: "Chocolate Making Workshops in Pune",
        metaTitle: "Chocolate Making Workshops in Pune | Only Workshops",
        metaDescription:
            "Chocolate making workshops in Pune: learn to temper couverture, make ganache and fillings, and shape truffles, bonbons or bark with a local chef. Book online.",
        intro: [
            "A chocolate making workshop teaches you how to work with real couverture chocolate, the kind pastry chefs use, and how to turn it into finished sweets. These workshops take place in Pune and are led by local chefs who explain each technique as they demonstrate it.",
            "The core skill is tempering: melting and cooling chocolate to exact temperatures so that it sets glossy, snaps cleanly and does not turn dull or streaky. From there a session usually moves on to fillings such as ganache and caramel, and to shaping truffles, filled bonbons, bars or chocolate bark. Along the way you hear how cocoa percentage changes flavour and texture, why a drop of water can make melted chocolate seize, and how to store what you make.",
            "You do not need a professional kitchen to keep practising: tempering can be done at home with a bowl, a spatula and a thermometer. The workshop suits chocolate lovers, home bakers who want a new skill, and anyone looking for a hands-on plan with friends or family. Each workshop page lists the menu for that session, what is included, the venue, the timing and how many seats are left.",
        ],
        titlePattern:
            /\bchoc(?:o)?lates?[\s-]+(?:making|workshop|class(?:es)?|masterclass)\b|\btruffles?\b|\bpralines?\b|\bbon[\s-]*bons?\b/i,
        related: ["macaron", "baking", "cooking-classes"],
        footer: true,
        faqs: [
            {
                question: "What is couverture chocolate?",
                answer: "Couverture is chocolate with a higher share of cocoa butter, which helps it melt smoothly and set with a shine and a clean snap once it is tempered. Compound chocolate swaps some of the cocoa butter for other fats: it is easier to use but does not taste or snap the same.",
            },
        ],
    },
    {
        slug: "macaron",
        name: "Macaron",
        linkLabel: "Macaron workshop",
        h1: "Macaron Workshops in Pune",
        metaTitle: "French Macaron Workshops in Pune | Only Workshops",
        metaDescription:
            "French macaron workshops in Pune: whip a stable meringue, fold the batter, pipe and bake smooth shells and make the fillings, guided step by step. Book online.",
        intro: [
            "A macaron workshop teaches you to make French macarons from scratch: two crisp, smooth almond-meringue shells sandwiched with a filling such as ganache, buttercream or jam. Macarons have a reputation for being temperamental, which is why a guided class helps. These workshops take place in Pune and are led by pastry chefs and bakers who show each step and explain what can go wrong.",
            "A session typically covers making a stable meringue, then folding in almond flour and sugar until the batter flows like slow lava, a step bakers call macaronage. You pipe even rounds, let them form a skin, and bake them so they rise with the frilly 'feet' at the base and no cracks. You also make and pipe fillings, and learn why macarons taste best after a night in the fridge, when the filling softens the shells to the classic chewy centre.",
            "The class suits home bakers who have tried macarons and want them to work every time, and patient beginners who enjoy precise baking. The name is often confused with macaroon, a coconut cookie; these workshops teach the French macaron. Each workshop page lists the flavours for that session, what is included, the venue and the seats left.",
        ],
        // Not /macar?on/: that misses the live "French Macron Workshop".
        titlePattern: /\bmaca?rons?\b/i,
        related: ["baking", "chocolate-making", "cooking-classes"],
        faqs: [
            {
                question: "Is a macaron the same as a macaroon?",
                answer: "No. A French macaron is a pair of smooth almond-meringue shells sandwiched with a filling. A macaroon is a dense, chewy cookie usually made with desiccated coconut. The workshops on this page teach French macarons.",
            },
        ],
    },
    {
        slug: "sourdough",
        name: "Sourdough",
        linkLabel: "Sourdough bread & pizza",
        h1: "Sourdough Bread & Pizza Workshops in Pune",
        metaTitle: "Sourdough Bread & Pizza Workshops in Pune | Only Workshops",
        metaDescription:
            "Sourdough workshops in Pune: start and feed a starter, shape and score a naturally leavened loaf, or stretch and bake sourdough pizza. Hands-on; book online.",
        intro: [
            "A sourdough workshop teaches you to bake with a starter: a living mix of flour and water whose wild yeast and bacteria leaven bread without packaged yeast and give it a gentle tang. These hands-on workshops take place in Pune and are led by local bakers.",
            "Depending on the session, you might start a starter from scratch and learn to feed, store and revive it; mix and fold a dough, shape a loaf and score it before baking; or stretch sourdough pizza bases, top them and bake them hot. Throughout, the focus is on reading fermentation rather than following a clock: how temperature and timing change the rise, the sourness and the open crumb good sourdough is known for. Warm weather, which Pune has for much of the year, speeds fermentation up, so knowing how to adjust timings matters here.",
            "Sourdough suits home bakers who want to move beyond yeasted bread, pizza lovers who want a better base at home, and beginners who want a guided start instead of learning from videos. Each workshop page says what you will make, what is included, the venue and how many seats are left.",
        ],
        titlePattern: /\bsour[\s-]*dough\b|\blevain\b/i,
        related: ["baking", "cooking-classes", "macaron"],
        faqs: [
            {
                question: "What is a sourdough starter?",
                answer: "A starter is a mix of flour and water kept alive with regular feeds. The wild yeast and bacteria in it make the dough rise and give sourdough its flavour, so it replaces packaged yeast. Looked after well, a starter keeps going for years.",
            },
        ],
    },
    {
        slug: "charcuterie-grazing-table",
        name: "Charcuterie & Grazing Table",
        linkLabel: "Charcuterie & grazing table workshop",
        h1: "Charcuterie & Grazing Table Workshops in Pune",
        // The site name does not fit in 60 characters here.
        metaTitle: "Charcuterie & Grazing Table Workshops in Pune",
        metaDescription:
            "Charcuterie board and grazing table workshops in Pune: pair cheeses, meats, fruit, dips and crackers and style a sharing spread for a party. Book online.",
        intro: [
            "A charcuterie and grazing table workshop teaches you to plan, prepare and style a sharing spread that looks as good as it tastes. Charcuterie traditionally means cured and cooked meats served on a board; a grazing table takes the same idea across a whole table, mixing cheeses, breads and crackers, fresh and dried fruit, nuts, dips and small bites. These workshops take place in Pune and are led by local chefs.",
            "A session typically covers choosing ingredients that balance each other in flavour, texture and colour, preparing some of the components yourself, such as dips, crackers or skewers, and then building the spread: placing the large items first, folding meats and cutting cheeses so they are easy to pick up, and filling the gaps so the board looks generous without waste. You also pick up practical tips on quantities per guest and on what can be prepared a day ahead.",
            "It suits people who host often, home cooks who enjoy presentation, and anyone planning a party who wants a centrepiece they made themselves. Menus vary from session to session, so check each workshop page for the full menu, what is included, the venue and the seats left.",
        ],
        titlePattern: /\b(?:charcuterie|grazing|cheese[\s-]*boards?)\b/i,
        related: ["cooking-classes", "sourdough", "baking"],
        faqs: [
            {
                question: "What is the difference between a charcuterie board and a grazing table?",
                answer: "A charcuterie board is a single board of cured meats, cheeses and accompaniments. A grazing table uses the same idea on a larger scale, covering a whole table with food for guests to help themselves, which makes it a centrepiece for a party.",
            },
        ],
    },
    {
        slug: "ice-plunge",
        name: "Ice Plunge",
        linkLabel: "Ice bath / ice plunge",
        h1: "Ice Plunge & Ice Bath Experience in Pune",
        metaTitle: "Ice Plunge & Ice Bath Experience in Pune | Only Workshops",
        metaDescription:
            "Guided ice plunge (ice bath or cold plunge) sessions in Pune: breathing techniques, cold-water safety and an immersion at your own pace. Book online.",
        intro: [
            "An ice plunge, also called an ice bath or cold plunge, is a short, deliberate immersion in ice-cold water. On Only Workshops it is a guided group session in Pune: an experienced guide prepares you, explains each stage and leads the plunge, so it suits first-timers as well as people who already practise cold exposure.",
            "A session usually begins on dry land with breathing exercises and a briefing on what the cold does to the body: the gasp reflex, why calm, slow breathing helps, how long to stay in and the signs that it is time to get out. Then comes the plunge itself, at your own pace, followed by warming up gradually afterwards. The emphasis is on control and staying present under stress, not on endurance records.",
            "People book an ice bath to test themselves, to try a practice they have read about, or as a shared challenge with friends or colleagues. Cold-water immersion is not right for everyone, though: if you are pregnant or have a heart condition, high blood pressure or another medical concern, check with your doctor before booking and tell the guide on the day. Each session page shows the date, time, venue, what is included and how many places are left.",
        ],
        titlePattern:
            /\bice[\s-]*(?:plunge|bath)s?\b|\bcold[\s-]*(?:plunge|water)\b|\bwim[\s-]*hof\b/i,
        related: ["pottery", "terrarium", "cooking-classes"],
        footer: true,
        faqs: [
            {
                question: "Are an ice plunge, an ice bath and a cold plunge the same thing?",
                answer: "Yes. All three names describe a short immersion in very cold water, usually in a tub filled with water and ice. The sessions on this page are guided.",
            },
        ],
    },
    {
        slug: "pottery",
        name: "Pottery",
        linkLabel: "Pottery classes",
        h1: "Pottery Workshops & Classes in Pune",
        metaTitle: "Pottery Workshops & Classes in Pune | Only Workshops",
        metaDescription:
            "Pottery workshops in Pune: centre clay on the potter's wheel, throw a bowl or cup, try hand-building and learn how glazing and firing work. Book online.",
        intro: [
            "A pottery workshop is a hands-on session where you shape clay into something you can use, such as a bowl, a cup or a small planter. These workshops take place in Pune and are led by potters who demonstrate each step and help you at the wheel.",
            "On the potter's wheel you learn the basics in order: centring the clay, opening it up, pulling up the walls and shaping the form, then trimming and finishing. Hand-building is slower and gentler: pinching, coiling and slab work let you make shapes the wheel cannot. Glazing adds colour and a waterproof finish, and many glazes look completely different once fired. Clay has to dry completely and go through the kiln before a piece is safe to use, so finished work is usually collected later rather than carried home on the day; check what is included on each workshop page.",
            "Pottery suits complete beginners, people looking for a slow, screen-free few hours, couples and friends, and anyone who wants to make something by hand. Expect wobbles on the first try; that is part of learning. Clay gets everywhere, so wear clothes you do not mind getting messy and keep your nails short if you can. Each workshop page shows the date, venue, what you will make and how many seats are left.",
        ],
        // Not a bare "clay": a polymer clay jewellery class is not pottery.
        titlePattern:
            /\b(?:pottery|ceramics?|wheel[\s-]*throwing|clay[\s-]+(?:pots?|pottery|modell?ing|work|studio))\b/i,
        categories: ["Pottery"],
        related: ["terrarium", "baking", "ice-plunge"],
        footer: true,
    },
    {
        slug: "terrarium",
        name: "Terrarium",
        linkLabel: "Terrarium workshop",
        h1: "Terrarium Making Workshops in Pune",
        metaTitle: "Terrarium Making Workshops in Pune | Only Workshops",
        metaDescription:
            "Terrarium making workshops in Pune: layer drainage and soil, choose plants and design a miniature garden in glass to take home, with tips on care. Book online.",
        intro: [
            "A terrarium is a small garden grown inside a glass container, and a terrarium making workshop teaches you to design and build one of your own. These hands-on workshops take place in Pune and are led by local gardeners and plant designers.",
            "A session usually starts with how a terrarium works: the layers that keep roots healthy, such as pebbles for drainage, a barrier layer and a suitable potting mix, and why open and closed containers suit different plants. You then choose plants and arrange them with stones, moss, sand or small decorative pieces to create a scene. Before you leave, you learn how much to water, where to keep the terrarium for the right light, and how to trim and clean it so it stays healthy for a long time.",
            "It is a calm, creative activity that suits plant lovers, people with little space for a garden, and families or friends who want to make something together. No gardening experience is needed to build a first terrarium. You finish with a living piece to take home, and each workshop page lists what is included, the venue and the seats left.",
        ],
        titlePattern: /\bterrari(?:ums?|a)\b/i,
        related: ["pottery", "ice-plunge", "baking"],
        footer: true,
        faqs: [
            {
                question: "How do you look after a terrarium?",
                answer: "Keep it in bright, indirect light rather than direct sun, which can overheat the glass. A closed terrarium needs water only rarely; an open one needs a light misting when the soil feels dry. Trim plants that touch the glass and remove dead leaves.",
            },
        ],
    },
    {
        slug: "baking",
        name: "Baking",
        linkLabel: "Baking classes",
        h1: "Baking Workshops & Classes in Pune",
        metaTitle: "Baking Workshops & Classes in Pune | Only Workshops",
        metaDescription:
            "Baking classes in Pune: bread and sourdough, cookies, cakes and muffins, babka, focaccia and French patisserie, taught by local bakers and chefs. Book online.",
        intro: [
            "Baking workshops in Pune cover everything from everyday bread to French patisserie, taught by local bakers and pastry chefs who show you the techniques recipes rarely explain. Bread classes deal with kneading or folding, proving and shaping, from yeasted loaves and enriched doughs such as babka to focaccia and naturally leavened sourdough. Sweet sessions cover cookies, muffins and cakes, while patisserie classes go into precise work such as French macarons.",
            "What happens in a session depends on the bake, but the pattern is similar: the host explains the recipe and the reason behind each step, demonstrates the tricky parts, and in hands-on sessions you mix, shape, pipe or decorate alongside. You learn how a dough should feel, how to tell when a bake is really done, and how to adapt a recipe to the oven you have at home. Sessions have also covered healthier baking with millet flours.",
            "Baking classes suit beginners who want a confident start, home bakers who want to fix a recipe that never quite works, and anyone who would like to spend a few hours making something to take home and share. Each workshop page shows what you will bake, what is included, the venue and the seats left.",
        ],
        titlePattern:
            /\b(?:bak(?:e|es|ed|er|ers|ery|ing)|breads?|sour[\s-]*dough|babka|brioche|foc+ac+ia|cookies?|muffins?|cupcakes?|cakes?|cheesecakes?|brownies?|croissants?|maca?rons?|patisserie|pastr(?:y|ies))\b/i,
        related: ["sourdough", "macaron", "chocolate-making", "cooking-classes"],
        footer: true,
    },
    {
        slug: "cooking-classes",
        name: "Cooking & Baking",
        linkLabel: "Cooking & baking classes",
        h1: "Cooking & Baking Classes in Pune",
        metaTitle: "Cooking & Baking Classes in Pune | Only Workshops",
        metaDescription:
            "Cooking and baking classes in Pune: bread and sourdough, chocolate, macarons, charcuterie boards, kimchi and more, led by local chefs. Book your seat online.",
        intro: [
            "Cooking and baking classes in Pune bring you into the kitchen with local chefs and bakers who teach a dish or a technique from start to finish. This page gathers the food workshops on Only Workshops in one place: baking and sourdough bread, chocolate making and French macarons, charcuterie boards and grazing tables, and cuisine-focused sessions such as Korean kimchi making.",
            "Each class combines explanation and demonstration with as much hands-on work as the dish allows, so you leave knowing why a recipe works, not just the steps. Expect to learn about the ingredients, the techniques the menu calls for and the small adjustments that make a recipe work in a home kitchen. Many sessions end with something to take home or to share at the table.",
            "Food workshops suit curious beginners, confident home cooks who want to learn something new, and friends and couples looking for a different plan for the day. Each workshop page lists the menu, what is included, the venue and how many seats are left.",
        ],
        // "cook(ing|ery)" but not "cookies": those reach this hub through `baking`.
        titlePattern:
            /\b(?:cooking|cookery|cuisine|kimchi|pasta|sushi|dumplings?|momos?|curry|curries|biryani)\b/i,
        categories: ["Food & Drink"],
        // Picks up food rows filed under another category (Babka as Arts & Crafts, Mindful
        // Baking as Wellness) through the topic they match.
        includeTopics: [
            "chocolate-making",
            "macaron",
            "sourdough",
            "charcuterie-grazing-table",
            "baking",
        ],
        related: ["baking", "sourdough", "chocolate-making", "charcuterie-grazing-table"],
    },
];

export function getSeoTopicBySlug(slug: string | null | undefined) {
    const normalized = slug?.trim().toLowerCase();
    if (!normalized) return null;
    return SEO_TOPICS.find((topic) => topic.slug === normalized) ?? null;
}

export function topicPagePath(city: Pick<SeoCity, "slug">, topic: Pick<SeoTopic, "slug">) {
    return `/workshops/${city.slug}/${topic.slug}`;
}

type TopicMatchFields = Pick<Workshop, "id" | "title" | "category">;

function matchesTopic(workshop: TopicMatchFields, topic: SeoTopic, seen: Set<string>): boolean {
    if (topic.excludeIds?.includes(workshop.id)) return false;
    if (topic.includeIds?.includes(workshop.id)) return true;
    if (topic.titlePattern.test(workshop.title ?? "")) return true;

    const category = workshop.category?.trim().toLowerCase();
    if (category && topic.categories?.some((value) => value.toLowerCase() === category)) {
        return true;
    }

    // `seen` stops a hub that (indirectly) includes itself from recursing forever.
    seen.add(topic.slug);
    return (topic.includeTopics ?? []).some((slug) => {
        const included = getSeoTopicBySlug(slug);
        return included && !seen.has(included.slug)
            ? matchesTopic(workshop, included, seen)
            : false;
    });
}

/** Overrides first (exclude, then include), then the title pattern, category and hub topics. */
export function workshopMatchesTopic(workshop: TopicMatchFields, topic: SeoTopic) {
    return matchesTopic(workshop, topic, new Set());
}

/** Every topic the workshop belongs to, most specific first. */
export function topicsForWorkshop(workshop: TopicMatchFields) {
    return SEO_TOPICS.filter((topic) => workshopMatchesTopic(workshop, topic));
}

/** The most specific topic, for the breadcrumb and "more like this" links; null when none fits. */
export function primaryTopicFor(workshop: TopicMatchFields) {
    return SEO_TOPICS.find((topic) => workshopMatchesTopic(workshop, topic)) ?? null;
}

/**
 * The thin-content rule from SEO_CITIES, shared by the topic page (robots) and the sitemap: index
 * a topic only while it has a date to book, a track record or real photos to show. `total` counts
 * upcoming and past sessions; `photos` counts past gallery images.
 */
export function topicIsIndexable(counts: { upcoming: number; total: number; photos: number }) {
    return counts.upcoming >= 1 || counts.total >= 2 || counts.photos >= 3;
}

/** A ready-made link to an activity page: the only topic data client components receive. */
export type TopicLink = { name: string; href: string };

/** The activity page a workshop belongs to, or null when it fits none or its city has no pages. */
export function topicLinkFor(
    workshop: Pick<Workshop, "id" | "title" | "category" | "city">
): TopicLink | null {
    const city = getSeoCityByName(workshop.city);
    const topic = city ? primaryTopicFor(workshop) : null;
    return city && topic ? { name: topic.name, href: topicPagePath(city, topic) } : null;
}

/**
 * Activity page per workshop id, for client lists (e.g. /past-events cards), worked out on the
 * server so the topic catalogue never ships to the browser. Workshops that fit none are left out.
 */
export function topicLinksFor(
    workshops: Pick<Workshop, "id" | "title" | "category" | "city">[]
): Record<string, TopicLink> {
    const links: Record<string, TopicLink> = {};
    for (const workshop of workshops) {
        const link = topicLinkFor(workshop);
        if (link) links[workshop.id] = link;
    }
    return links;
}
