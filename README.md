<p align="center">
  <img src="public/images/logo-black.jpeg" alt="OnlyWorkshop" width="80" height="80" style="border-radius: 16px;" />
</p>

<h1 align="center">OnlyWorkshop</h1>

<p align="center">
  <strong>Discover & book creative workshops happening in your city.</strong><br/>
  Pottery · Painting · Baking · Woodworking · Candle Making · DIY Crafts
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-14-black?logo=next.js" />
  <img src="https://img.shields.io/badge/TypeScript-5.7-blue?logo=typescript" />
  <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?logo=tailwindcss" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%2B%20DB-3ecf8e?logo=supabase" />
  <img src="https://img.shields.io/badge/Framer%20Motion-11-ff69b4?logo=framer" />
</p>

---

## ✨ Overview

**OnlyWorkshop** is a modern SaaS web application for discovering and booking creative, hands-on workshops in cities across India. The platform lets users explore curated experiences — from pottery and painting to baking and woodworking — view rich workshop details with videos and creator profiles, and book spots with a seamless checkout flow.

The application is designed to be **production-ready, scalable, and visually premium** with smooth animations, warm earthy aesthetics, and mobile-first responsive layouts.

---

## 🖼️ Screenshots

| Homepage | Workshop Detail | Admin Panel |
|----------|-----------------|-------------|
| ![Home](public/images/workshops/1.webp) | Immersive gallery, video player, creator profiles | Dashboard + workshop creation form |

---

## 🛠️ Tech Stack

| Layer              | Technology                                           |
|--------------------|------------------------------------------------------|
| **Framework**      | [Next.js 14](https://nextjs.org/) (App Router)       |
| **Language**       | [TypeScript](https://www.typescriptlang.org/) 5.7    |
| **Styling**        | [Tailwind CSS](https://tailwindcss.com/) 3.4         |
| **Animations**     | [Framer Motion](https://www.framer.com/motion/) 11 + [GSAP](https://gsap.com/) |
| **Icons**          | [Lucide React](https://lucide.dev/)                  |
| **Auth & Database**| [Supabase](https://supabase.com/) (PostgreSQL + Auth)|
| **State**          | [Zustand](https://zustand-demo.pmnd.rs/) 5           |
| **Payments**       | Razorpay                                             |
| **Observability**  | Sentry + PostHog (env-gated)                         |
| **Media Storage**  | Cloudflare R2 *(planned)*                            |
| **Deployment**     | Vercel *(target)*                                    |

---

## 📁 Project Structure

```
app/
├── public/
│   └── images/
│       ├── background.png          # Hero background image
│       ├── logo-black.jpeg         # Logo (dark version)
│       ├── logo-white.jpeg         # Logo (light version)
│       └── workshops/              # Workshop gallery images (32 images)
│
├── src/
│   ├── app/
│   │   ├── layout.tsx              # Root layout (fonts, AuthProvider, metadata)
│   │   ├── page.tsx                # Homepage (hero, categories, featured, CTA)
│   │   ├── globals.css             # Global styles, design tokens, utilities
│   │   │
│   │   ├── auth/
│   │   │   ├── login/page.tsx      # Login page (email + Google OAuth)
│   │   │   └── signup/page.tsx     # Signup page (with email confirmation)
│   │   │
│   │   ├── explore/page.tsx        # Browse all workshops with filters
│   │   ├── workshop/[id]/page.tsx  # Workshop detail (gallery, video, host, booking)
│   │   ├── booking/page.tsx        # Booking flow (auth-guarded, 2-step checkout)
│   │   ├── admin/page.tsx          # Admin dashboard + workshop creation form
│   │   └── dashboard/page.tsx      # User dashboard (my bookings)
│   │
│   ├── components/
│   │   ├── Navbar.tsx              # Auth-aware navigation bar
│   │   ├── Footer.tsx              # Site footer with links
│   │   ├── MobileNav.tsx           # Bottom mobile navigation bar
│   │   ├── WorkshopCard.tsx        # Workshop preview card component
│   │   ├── CategoryFilter.tsx      # Category filter pills
│   │   └── SearchBar.tsx           # Search input component
│   │
│   └── lib/
│       ├── auth-context.tsx        # Supabase Auth context provider (useAuth hook)
│       ├── supabase.ts             # Supabase client initialization
│       ├── data.ts                 # Workshop interface, mock data, categories
│       └── utils.ts                # Utility functions (formatCurrency, formatDate, cn)
│
├── tailwind.config.ts              # Tailwind configuration with custom design tokens
├── next.config.mjs                 # Next.js configuration
├── tsconfig.json                   # TypeScript configuration
└── package.json                    # Dependencies and scripts
```

---

## 🎨 Design System

### Color Palette

| Token          | Hex       | Usage                        |
|----------------|-----------|------------------------------|
| **Cream**      | `#F5EFE6` | Primary background           |
| **Black**      | `#1A1A1A` | Primary text                 |
| **Terracotta** | `#C76B4A` | Primary buttons, accents     |
| **Clay**       | `#D4A574` | Secondary elements, borders  |
| **Warm Gray**  | `#8B8175` | Muted text                   |

### Typography

| Role     | Font             | Weight     |
|----------|------------------|------------|
| Headings | Playfair Display  | 600 / 700  |
| Body     | Inter             | 400 / 500  |

---

## 🚀 Features

### 🏠 Homepage
- Animated hero section with background image and search CTA
- Category filter pills (Pottery, Painting, Baking, etc.)
- Featured workshop grid with hover animations
- "How It Works" section
- "Want to Host?" contact section (email + phone)
- Testimonials and stats

### 🔐 Authentication (Supabase Auth)
- Email/password sign-in and sign-up
- Google OAuth integration
- Session persistence with automatic token refresh
- Auth-aware Navbar (user avatar + sign out when logged in)
- Email confirmation flow on registration

### 🎨 Workshop Detail Page
- Multi-image gallery with main image + thumbnails
- **Video player modal** — embedded YouTube / Cloudflare Stream
- **Social links** — Instagram, YouTube, Website pill buttons
- **Enhanced host profile** — avatar, bio, experience badge, social icons
- Sticky booking sidebar with guest counter and price breakdown
- **Auth guard** — "Log in to Book" button redirects unauthenticated users
- Responsive mobile booking bar

### 📝 Booking Page
- **Login-required guard** — redirects to `/auth/login` if not authenticated
- Pre-fills user name and email from Supabase session
- 2-step flow: Guest Info → Confirm & Pay
- Order summary sidebar with workshop media, creator info, social links
- Booking confirmation screen

### ⚙️ Admin Panel
- Dashboard with stats (active workshops, bookings, revenue, avg rating)
- Workshop list with status badges (Active / Almost Full)
- **Comprehensive workshop creation form:**
  - Basic info (title, description, category, price, date/time, location, seats)
  - Media (cover image URL, gallery images, video URL)
  - Social links (Instagram, YouTube, Website)
  - Creator/host info (name, bio, experience, social links)
  - Dynamic list builders for "What You Learn" and "Materials Provided"

### 📱 Mobile Responsive
- Bottom navigation bar for mobile
- Sticky mobile booking bar on workshop detail
- Responsive grids and layouts throughout
- Mobile-optimized hamburger menu with auth state

---

## ⚡ Getting Started

### Prerequisites

- **Node.js** ≥ 18
- **npm** ≥ 9
- A [Supabase](https://supabase.com/) project (free tier works)

### 1. Clone the repository

```bash
git clone https://github.com/your-username/onlyworkshop.git
cd onlyworkshop/app
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up environment variables

Create a `.env.local` file in the `app/` directory:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
# Optional fallback:
# NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret
RAZORPAY_WEBHOOK_SECRET=your-razorpay-webhook-secret

# Optional observability
# NEXT_PUBLIC_POSTHOG_KEY=...
# NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
# NEXT_PUBLIC_SENTRY_DSN=...
# SENTRY_DSN=...
```

> Get these from your Supabase project: **Settings → API → Project URL & anon/public key**

### 4. Configure Supabase Auth (Optional)

In your Supabase dashboard:
1. Go to **Authentication → Providers**
2. Enable **Email** (enabled by default)
3. Enable **Google** OAuth (requires Google Cloud Console credentials)
4. Add your site URL to **URL Configuration → Site URL**: `http://localhost:3000`
5. Add redirect URLs: `http://localhost:3000/**`

### 5. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Build for production

```bash
npm run build
npm run start
```

---

## 📦 Available Scripts

| Command         | Description                        |
|-----------------|------------------------------------|
| `npm run dev`   | Start development server           |
| `npm run build` | Create production build             |
| `npm run start` | Start production server             |
| `npm run lint`  | Run ESLint                          |

---

## 🗃️ Data Model

The `Workshop` interface (currently using mock data, ready for Supabase migration):

```typescript
interface Workshop {
  id: string;
  title: string;
  description: string;
  category: string;
  price: number;                    // INR
  location: string;
  city: string;
  date: string;
  time: string;
  duration: string;
  maxSeats: number;
  seatsRemaining: number;
  rating: number;
  reviewCount: number;
  coverImage: string;
  galleryImages: string[];
  isBestseller: boolean;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  whatYouLearn: string[];
  materialsProvided: string[];

  // Media
  videoUrl?: string;                // YouTube embed or Cloudflare Stream
  socialLinks?: {                   // Workshop social accounts
    instagram?: string;
    youtube?: string;
    website?: string;
  };

  // Host / Creator
  hostName: string;
  hostAvatar: string;
  hostBio: string;
  hostExperience?: string;          // e.g. "10+ years in ceramics"
  hostSocialLinks?: {
    instagram?: string;
    youtube?: string;
    website?: string;
  };
}
```

---

## 🗺️ Roadmap

- [x] Homepage with hero, categories, and featured workshops
- [x] Workshop detail page with gallery, video, and host profiles
- [x] Supabase authentication (email + Google OAuth)
- [x] Auth-guarded booking flow
- [x] Admin dashboard and workshop creation form
- [ ] Connect admin form to Supabase database
- [x] Razorpay payment integration
- [ ] Cloudflare R2 media storage with image uploads
- [ ] User reviews and ratings
- [ ] Workshop search with filters (date, price, location)
- [ ] Email notifications (booking confirmation, reminders)
- [ ] SEO optimization (dynamic meta tags per workshop)
- [ ] Vercel deployment with CI/CD

---

## 🤝 Contributing

This is a private project. If you'd like to contribute, please contact the team at **hello@onlyworkshop.com**.

---

## 📄 License

This project is proprietary. All rights reserved.

---

<p align="center">
  Made with ❤️ by the <strong>OnlyWorkshop</strong> team
</p>
