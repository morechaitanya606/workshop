// Workshop image data - maps to actual images from /ow website images/
// These are local paths during development; in production, use Cloudflare R2 URLs

export const workshopImages = {
    // Workshop cover and gallery images
    pottery1: "/images/workshops/IMG_20260306_125435.webp",
    pottery2: "/images/workshops/IMG_20260306_125503.webp",
    pottery3: "/images/workshops/IMG_20260306_125535.webp",
    painting1: "/images/workshops/IMG_20260306_125552.webp",
    painting2: "/images/workshops/IMG_20260306_125609.webp",
    crafts1: "/images/workshops/IMG_20260306_125622.webp",
    crafts2: "/images/workshops/IMG_20260306_125643.webp",
    workshop1: "/images/workshops/IMG_20260306_125722.webp",
    workshop2: "/images/workshops/IMG_20260306_125743.webp",
    workshop3: "/images/workshops/IMG_20260306_125759.webp",
    workshop4: "/images/workshops/IMG_20260306_125816.webp",
    workshop5: "/images/workshops/IMG_20260306_125836.webp",
    workshop6: "/images/workshops/IMG_20260306_125941.webp",
    workshop7: "/images/workshops/IMG_20260306_125957.webp",
    workshop8: "/images/workshops/IMG_20260306_130025.webp",
    workshop9: "/images/workshops/IMG_20260306_130143.webp",
    workshop10: "/images/workshops/IMG_20260306_130158.webp",
    workshop11: "/images/workshops/IMG_20260306_130217.webp",
    workshop12: "/images/workshops/IMG_20260306_130237.webp",
    workshop13: "/images/workshops/IMG_20260306_130322.webp",
    workshop14: "/images/workshops/IMG_20260306_130407.webp",
    workshop15: "/images/workshops/IMG_20260306_130429.webp",
    workshop16: "/images/workshops/IMG_20260306_130454.webp",
    workshop17: "/images/workshops/IMG_20260306_130534.webp",
    workshop18: "/images/workshops/IMG_20260306_130705.webp",
    workshop19: "/images/workshops/IMG_20260306_130725.webp",
    hero: "/images/background.webp",
    whatsapp1: "/images/workshops/IMG-20260306-WA0006.webp",
    whatsapp2: "/images/workshops/IMG-20260306-WA0007.webp",
    whatsapp3: "/images/workshops/IMG-20260306-WA0008.webp",
    large1: "/images/workshops/1772784515448.webp",
};

// Brand assets
export const brandAssets = {
    logoBlack: "/images/logo-black.jpeg",
    logoWhite: "/images/logo-white.jpeg",
    background: "/images/background.webp",
};

// Mock workshop data
export interface Workshop {
    id: string;
    title: string;
    description: string;
    category: string;
    price: number;
    location: string;
    city: string;
    duration: string;
    date: string;
    time: string;
    maxSeats: number;
    seatsRemaining: number;
    coverImage: string;
    galleryImages: string[];
    videoUrl?: string;
    rating: number;
    reviewCount: number;
    hostName: string;
    hostAvatar: string;
    hostBio: string;
    hostExperience?: string;
    hostSocialLinks?: {
        instagram?: string;
        youtube?: string;
        website?: string;
    };
    socialLinks?: {
        instagram?: string;
        youtube?: string;
        website?: string;
    };
    whatYouLearn: string[];
    materialsProvided: string[];
    feedbackHighlight?: string;
    feedbackAuthor?: string;
    isNew?: boolean;
    isBestseller?: boolean;
}

export const categories = [
    { id: "trending", label: "Trending", icon: "🔥" },
    { id: "arts-crafts", label: "Arts & Crafts", icon: "✂️" },
    { id: "food-drink", label: "Food & Drink", icon: "🍳" },
    { id: "pottery", label: "Pottery", icon: "🏺" },
    { id: "painting", label: "Painting", icon: "🎨" },
    { id: "music", label: "Music", icon: "🎵" },
    { id: "wellness", label: "Wellness", icon: "🧘" },
    { id: "photography", label: "Photography", icon: "📷" },
];

export const mockWorkshops: Workshop[] = [
    {
        id: "1",
        title: "Intro to Wheel Throwing: Make Your Own Mug",
        description:
            "Join us for a 2-hour crash course in ceramics. We provide the clay, the tools, and the wine. You provide the creativity. This workshop is designed for complete beginners who want to try their hand at the potter's wheel in a relaxed, social environment.\n\nYou'll learn the basics of centering, opening, and pulling walls. By the end of the night, you'll have 1-2 pieces that we will glaze and fire for you to pick up later.",
        category: "Pottery",
        price: 1500,
        location: "Brooklyn Clay Studio",
        city: "Pune",
        duration: "2 hours",
        date: "2026-03-15",
        time: "14:00",
        maxSeats: 15,
        seatsRemaining: 3,
        coverImage: workshopImages.pottery1,
        galleryImages: [
            workshopImages.pottery1,
            workshopImages.pottery2,
            workshopImages.pottery3,
        ],
        videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        rating: 4.9,
        reviewCount: 128,
        hostName: "Sarah Jenkins",
        hostAvatar: workshopImages.whatsapp1,
        hostBio:
            "Master potter with 10+ years of experience. I believe in getting your hands dirty and letting creativity flow. My studio is a judgment-free zone!",
        hostExperience: "10+ years in ceramics",
        hostSocialLinks: {
            instagram: "https://instagram.com/sarahjenkins_pottery",
            youtube: "https://youtube.com/@sarahpots",
            website: "https://sarahjenkins.studio",
        },
        socialLinks: {
            instagram: "https://instagram.com/onlyworkshop",
            youtube: "https://youtube.com/@onlyworkshop",
        },
        whatYouLearn: [
            "Pottery basics",
            "Centering clay on the wheel",
            "Pulling walls technique",
            "Glazing application",
        ],
        materialsProvided: [
            "All pottery tools & clay",
            "Glazing and firing service",
            "2 glasses of wine or beer",
            "Aprons provided",
        ],
        isBestseller: true,
    },
    {
        id: "2",
        title: "Sourdough 101: From Starter to Loaf",
        description:
            "Learn the art of sourdough baking from scratch. You'll create your own starter, understand fermentation, and take home a beautiful loaf of bread.",
        category: "Food & Drink",
        price: 1200,
        location: "The Artisan Kitchen",
        city: "Pune",
        duration: "3 hours",
        date: "2026-03-16",
        time: "10:00",
        maxSeats: 12,
        seatsRemaining: 5,
        coverImage: workshopImages.crafts1,
        galleryImages: [
            workshopImages.crafts1,
            workshopImages.crafts2,
            workshopImages.workshop1,
        ],
        videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        rating: 5.0,
        reviewCount: 42,
        hostName: "Priya Sharma",
        hostAvatar: workshopImages.whatsapp2,
        hostBio:
            "Professional baker and sourdough enthusiast. I've been baking for over 15 years and love sharing the magic of fermentation.",
        hostExperience: "15+ years in baking",
        hostSocialLinks: {
            instagram: "https://instagram.com/priya_bakes",
            website: "https://artisankitchen.in",
        },
        whatYouLearn: [
            "Creating a sourdough starter",
            "Understanding fermentation",
            "Shaping techniques",
            "Scoring patterns",
        ],
        materialsProvided: [
            "Flour and ingredients",
            "Starter culture to take home",
            "Recipe booklet",
            "Fresh coffee",
        ],
        isNew: true,
    },
    {
        id: "3",
        title: "Neon Paint & Sip: Glow in the Dark Art",
        description:
            "Unleash your inner artist with our neon painting experience. Paint with UV-reactive colors under blacklights while enjoying your favorite drinks.",
        category: "Painting",
        price: 1800,
        location: "Art Loft 4",
        city: "Pune",
        duration: "2.5 hours",
        date: "2026-03-14",
        time: "20:00",
        maxSeats: 20,
        seatsRemaining: 8,
        coverImage: workshopImages.painting1,
        galleryImages: [
            workshopImages.painting1,
            workshopImages.painting2,
            workshopImages.workshop2,
        ],
        rating: 4.8,
        reviewCount: 89,
        hostName: "Arjun Mehta",
        hostAvatar: workshopImages.whatsapp3,
        hostBio:
            "Contemporary artist blending traditional techniques with modern glow art. Every canvas tells a story.",
        hostExperience: "8 years in art",
        hostSocialLinks: {
            instagram: "https://instagram.com/arjun_glowart",
        },
        whatYouLearn: [
            "Color mixing with neon paints",
            "Blacklight painting techniques",
            "Abstract composition",
            "UV art fundamentals",
        ],
        materialsProvided: [
            "All painting supplies",
            "Canvas to take home",
            "UV reactive paints",
            "2 drinks included",
        ],
    },
    {
        id: "4",
        title: "Underground Jazz: The Blue Note Experience",
        description:
            "Experience live jazz in an intimate underground setting. Learn about jazz history, improvisation, and enjoy performances by local musicians.",
        category: "Music",
        price: 800,
        location: "The Blue Note Lounge",
        city: "Pune",
        duration: "2 hours",
        date: "2026-03-15",
        time: "21:00",
        maxSeats: 30,
        seatsRemaining: 12,
        coverImage: workshopImages.workshop3,
        galleryImages: [
            workshopImages.workshop3,
            workshopImages.workshop4,
            workshopImages.workshop5,
        ],
        rating: 4.7,
        reviewCount: 210,
        hostName: "Mark Dale",
        hostAvatar: workshopImages.whatsapp1,
        hostBio:
            "Jazz musician and educator with a passion for bringing people together through music.",
        hostExperience: "20 years in jazz",
        whatYouLearn: [
            "Jazz history essentials",
            "Improvisation basics",
            "Music appreciation",
            "Rhythm and feel",
        ],
        materialsProvided: [
            "Live music performance",
            "Welcome drink",
            "Jazz history booklet",
        ],
    },
    {
        id: "5",
        title: "Coffee Cupping & Latte Art Workshop",
        description:
            "Dive deep into the world of specialty coffee. Learn professional cupping techniques and master the art of latte art.",
        category: "Food & Drink",
        price: 1000,
        location: "Third Wave Café",
        city: "Pune",
        duration: "2 hours",
        date: "2026-03-16",
        time: "11:00",
        maxSeats: 10,
        seatsRemaining: 4,
        coverImage: workshopImages.workshop6,
        galleryImages: [
            workshopImages.workshop6,
            workshopImages.workshop7,
            workshopImages.workshop8,
        ],
        rating: 4.9,
        reviewCount: 0,
        hostName: "Riya Patel",
        hostAvatar: workshopImages.whatsapp2,
        hostBio:
            "Certified Q Grader and specialty coffee roaster. On a mission to make everyone appreciate good coffee.",
        hostExperience: "6 years in specialty coffee",
        hostSocialLinks: {
            instagram: "https://instagram.com/riya_coffee",
        },
        whatYouLearn: [
            "Professional cupping protocol",
            "Flavor identification",
            "Latte art patterns",
            "Brewing methods",
        ],
        materialsProvided: [
            "Specialty coffee beans",
            "Cupping sets",
            "Milk & equipment",
            "Take-home coffee sample",
        ],
        isNew: true,
    },
    {
        id: "6",
        title: "Urban Gardening: Balcony Oasis Basics",
        description:
            "Transform your balcony into a green oasis. Learn container gardening, composting, and how to grow herbs and vegetables in small spaces.",
        category: "Wellness",
        price: 700,
        location: "Green Thumb Garden Center",
        city: "Pune",
        duration: "2 hours",
        date: "2026-03-22",
        time: "10:00",
        maxSeats: 15,
        seatsRemaining: 9,
        coverImage: workshopImages.workshop9,
        galleryImages: [
            workshopImages.workshop9,
            workshopImages.workshop10,
            workshopImages.workshop11,
        ],
        rating: 4.6,
        reviewCount: 0,
        hostName: "Anita Desai",
        hostAvatar: workshopImages.whatsapp3,
        hostBio:
            "Urban farming advocate and landscape designer. Helping city dwellers connect with nature.",
        whatYouLearn: [
            "Container gardening essentials",
            "Soil and composting",
            "Plant selection for balconies",
            "Watering and maintenance",
        ],
        materialsProvided: [
            "Starter plant kit",
            "Organic soil mix",
            "Gardening tools",
            "Care guide booklet",
        ],
        isNew: true,
    },
    {
        id: "7",
        title: "Watercolor & Wine Night",
        description:
            "A relaxing evening of watercolor painting with a glass of wine. Perfect for beginners looking to explore their creative side.",
        category: "Painting",
        price: 1400,
        location: "The Art Studio",
        city: "Pune",
        duration: "2.5 hours",
        date: "2026-03-19",
        time: "18:00",
        maxSeats: 16,
        seatsRemaining: 6,
        coverImage: workshopImages.workshop12,
        galleryImages: [
            workshopImages.workshop12,
            workshopImages.workshop13,
            workshopImages.workshop14,
        ],
        rating: 4.8,
        reviewCount: 65,
        hostName: "Kavita Rao",
        hostAvatar: workshopImages.whatsapp1,
        hostBio:
            "Watercolor artist and wine enthusiast. Combining two of life's great pleasures into one creative experience.",
        hostSocialLinks: {
            instagram: "https://instagram.com/kavita_watercolors",
        },
        whatYouLearn: [
            "Watercolor fundamentals",
            "Wet-on-wet technique",
            "Color theory basics",
            "Botanical illustration",
        ],
        materialsProvided: [
            "Watercolor paper & paints",
            "Professional brushes",
            "2 glasses of wine",
            "Light snacks",
        ],
    },
    {
        id: "8",
        title: "Intro to Japanese Woodworking",
        description:
            "Discover the ancient art of Japanese joinery. Learn to create beautiful wood joints without nails or screws using traditional hand tools.",
        category: "Arts & Crafts",
        price: 2500,
        location: "The Makers Guild",
        city: "Pune",
        duration: "3 hours",
        date: "2026-03-21",
        time: "10:00",
        maxSeats: 8,
        seatsRemaining: 2,
        coverImage: workshopImages.workshop15,
        galleryImages: [
            workshopImages.workshop15,
            workshopImages.workshop16,
            workshopImages.workshop17,
        ],
        videoUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
        rating: 4.9,
        reviewCount: 34,
        hostName: "Vikram Singh",
        hostAvatar: workshopImages.whatsapp2,
        hostBio:
            "Master woodworker trained in traditional Japanese techniques. Creating functional art from raw timber.",
        hostExperience: "12 years in woodworking",
        hostSocialLinks: {
            instagram: "https://instagram.com/vikram_wood",
            youtube: "https://youtube.com/@vikramwoodcraft",
            website: "https://makersguild.in",
        },
        whatYouLearn: [
            "Japanese joinery principles",
            "Hand tool techniques",
            "Wood selection",
            "Creating a dovetail joint",
        ],
        materialsProvided: [
            "Premium wood blanks",
            "Japanese hand tools",
            "Safety equipment",
            "Finished piece to take home",
        ],
        isBestseller: true,
    },
    {
        id: "past-1",
        title: "Handmade Candle & Fragrance Lab",
        description:
            "A cozy, hands-on candle-making evening where participants blended custom fragrances, poured soy wax candles, and learned safe home-studio techniques.",
        category: "Arts & Crafts",
        price: 1300,
        location: "Studio Scent",
        city: "Pune",
        duration: "2 hours",
        date: "2026-02-18",
        time: "17:30",
        maxSeats: 18,
        seatsRemaining: 0,
        coverImage: workshopImages.workshop18,
        galleryImages: [
            workshopImages.workshop18,
            workshopImages.workshop19,
            workshopImages.whatsapp2,
        ],
        rating: 4.8,
        reviewCount: 57,
        hostName: "Meera Kulkarni",
        hostAvatar: workshopImages.whatsapp3,
        hostBio:
            "Fragrance artist and workshop host who blends storytelling with scent design.",
        hostExperience: "7 years in candle and scent design",
        hostSocialLinks: {
            instagram: "https://instagram.com/studioscent.in",
        },
        whatYouLearn: [
            "Fragrance notes and blending basics",
            "Safe wax melting and pouring",
            "Wick sizing and cure times",
            "Packaging and gift finishing",
        ],
        materialsProvided: [
            "Soy wax and fragrance oils",
            "Glass jars and cotton wicks",
            "Protective gloves and tools",
            "One finished candle to take home",
        ],
        feedbackHighlight:
            "I loved blending my own signature scent and the host explained every step clearly. Super relaxing session.",
        feedbackAuthor: "Ananya P.",
    },
];

// Social proof metrics
export const socialMetrics = [
    { label: "Happy Participants", value: 1000, suffix: "+" },
    { label: "Workshops Hosted", value: 50, suffix: "+" },
    { label: "Creative Collaborations", value: 20, suffix: "+" },
    { label: "5-Star Reviews", value: 500, suffix: "+" },
];

// Gallery images for masonry grid
export const galleryImages = [
    workshopImages.pottery1,
    workshopImages.painting1,
    workshopImages.crafts1,
    workshopImages.workshop3,
    workshopImages.workshop6,
    workshopImages.workshop9,
    workshopImages.workshop12,
    workshopImages.workshop15,
    workshopImages.whatsapp1,
    workshopImages.whatsapp2,
    workshopImages.whatsapp3,
    workshopImages.large1,
];
