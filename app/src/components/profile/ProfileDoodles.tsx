import {
    Amphora,
    Bird,
    Cake,
    Cat,
    Coffee,
    Cookie,
    Croissant,
    Dog,
    Fish,
    Flower2,
    Palette,
    Panda,
    PawPrint,
    Pizza,
    Rabbit,
    Snowflake,
    Sparkles,
    Sprout,
    Squirrel,
    Turtle,
    Wheat,
    type LucideIcon,
} from "lucide-react";

type Doodle = {
    Icon: LucideIcon;
    /** Position inside the page, as CSS percentages. */
    top: string;
    left: string;
    size: number;
    rotate: number;
    tone: "terracotta" | "sage" | "clay";
    /** Shown on phones too; the rest only from `md` up, where there is empty space. */
    phone?: boolean;
};

/*
 * One doodle per kind of workshop on the site (pottery, baking, chocolate and cookies, sourdough
 * pizza, coffee, flowers, terrariums, ice plunge, art), with a few friendly animals in between.
 * Positions are fixed rather than random: random values would differ between the server render
 * and hydration.
 */
const DOODLES: readonly Doodle[] = [
    {
        Icon: Amphora,
        top: "6%",
        left: "4%",
        size: 44,
        rotate: -12,
        tone: "terracotta",
        phone: true,
    },
    { Icon: Bird, top: "4%", left: "30%", size: 30, rotate: 8, tone: "sage" },
    { Icon: Sparkles, top: "10%", left: "52%", size: 22, rotate: 0, tone: "terracotta" },
    { Icon: Croissant, top: "14%", left: "88%", size: 40, rotate: 14, tone: "clay", phone: true },
    { Icon: Cookie, top: "22%", left: "70%", size: 28, rotate: -20, tone: "terracotta" },
    { Icon: Cat, top: "26%", left: "93%", size: 34, rotate: -8, tone: "terracotta" },
    { Icon: Flower2, top: "30%", left: "2%", size: 36, rotate: 8, tone: "sage" },
    { Icon: Rabbit, top: "38%", left: "8%", size: 32, rotate: 6, tone: "clay", phone: true },
    { Icon: Coffee, top: "40%", left: "93%", size: 34, rotate: -10, tone: "terracotta" },
    { Icon: Wheat, top: "46%", left: "78%", size: 30, rotate: 22, tone: "sage" },
    { Icon: Sprout, top: "52%", left: "4%", size: 38, rotate: -6, tone: "sage" },
    { Icon: Fish, top: "56%", left: "88%", size: 32, rotate: 12, tone: "clay" },
    { Icon: Cake, top: "64%", left: "92%", size: 40, rotate: 10, tone: "clay" },
    {
        Icon: Squirrel,
        top: "66%",
        left: "6%",
        size: 36,
        rotate: -10,
        tone: "terracotta",
        phone: true,
    },
    { Icon: Snowflake, top: "76%", left: "3%", size: 30, rotate: 18, tone: "clay" },
    { Icon: Dog, top: "78%", left: "80%", size: 38, rotate: 6, tone: "sage" },
    {
        Icon: Palette,
        top: "86%",
        left: "90%",
        size: 42,
        rotate: -16,
        tone: "terracotta",
        phone: true,
    },
    { Icon: Turtle, top: "88%", left: "12%", size: 34, rotate: 4, tone: "sage" },
    { Icon: Pizza, top: "92%", left: "44%", size: 32, rotate: 12, tone: "clay" },
    { Icon: Panda, top: "94%", left: "66%", size: 34, rotate: -6, tone: "terracotta" },
    { Icon: PawPrint, top: "70%", left: "50%", size: 22, rotate: 20, tone: "clay" },
];

const TONES: Record<Doodle["tone"], string> = {
    terracotta: "text-terracotta/20",
    sage: "text-emerald-700/15",
    clay: "text-clay",
};

/**
 * Faint line drawings of the activities (and a few animals), scattered behind the profile so the page does not look
 * empty while it loads or when a list is short. Purely decorative: hidden from screen readers and
 * never clickable. Place it as the first child of a `relative` container.
 */
export default function ProfileDoodles() {
    return (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
            {DOODLES.map(({ Icon, top, left, size, rotate, tone, phone }, index) => (
                <Icon
                    key={index}
                    width={size}
                    height={size}
                    strokeWidth={1.25}
                    className={`absolute ${TONES[tone]} ${phone ? "" : "hidden md:block"}`}
                    style={{ top, left, transform: `rotate(${rotate}deg)` }}
                />
            ))}
        </div>
    );
}
