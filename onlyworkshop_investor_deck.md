# OnlyWorkshop — Platform Architecture & Business Overview

> **Prepared for**: Clients, Investors & Stakeholders  
> **Date**: March 2026  
> **Version**: 1.0

---

## 1. Executive Summary

**OnlyWorkshop** is a modern marketplace SaaS platform connecting creative workshop hosts (potters, painters, bakers, woodworkers) with learners looking for hands-on experiences across Indian cities. Think **"BookMyShow for Creative Workshops"**.

The platform handles discovery, booking, payments, host management, and post-experience feedback — creating a **full-lifecycle ecosystem** for the experience economy.

---

## 2. Platform Vision

```mermaid
mindmap
  root((OnlyWorkshop))
    Discovery
      Browse by Category
      Search & Filters
      City-based Exploration
      Bestseller Badges
    Booking
      Seat Reservation Holds
      Razorpay Payments
      Booking Confirmation
      Email Notifications
    Hosting
      Creator Registration
      Venue Registration
      Workshop Management
      Earnings & Payouts
    Community
      User Reviews & Ratings
      Favorites & Wishlists
      Waitlists
      Social Sharing
```

---

## 3. How It Works — User Journey

```mermaid
journey
    title User Booking Journey
    section Discovery
      Visit Homepage: 5: User
      Browse Categories: 4: User
      Search Workshops: 4: User
      View Workshop Details: 5: User
    section Booking
      Select Date & Guests: 4: User
      Seat Hold Created: 5: System
      Fill Booking Details: 3: User
      Pay via Razorpay: 4: User, System
    section Confirmation
      Booking Confirmed: 5: System
      Email Sent: 5: System
      View in Dashboard: 4: User
    section Experience
      Attend Workshop: 5: User
      Leave Feedback: 4: User
      Host Gets Paid: 5: System
```

---

## 4. System Architecture

```mermaid
graph TB
    subgraph "Frontend — Next.js 14 App Router"
        A[Homepage] --> B[Explore / Search]
        B --> C[Workshop Detail Page]
        C --> D[Booking Flow]
        D --> E[User Dashboard]
        F[Admin Panel] --> G[Workshop Management]
        F --> H[Analytics & Payouts]
        I[Host Dashboard] --> J[My Workshops]
        I --> K[Earnings & Bookings]
    end

    subgraph "Backend — Next.js API Routes"
        L["/api/auth/*"]
        M["/api/workshops/*"]
        N["/api/bookings/*"]
        O["/api/payments/razorpay"]
        P["/api/host/*"]
        Q["/api/admin/*"]
        R["/api/favorites"]
        S["/api/profile"]
        T["/api/upload"]
        U["/api/cron/emails"]
        V["/api/host-applications"]
    end

    subgraph "Infrastructure"
        W[(Supabase PostgreSQL)]
        X[Supabase Auth]
        Y[Razorpay Gateway]
        Z[Resend Email API]
        AA[Sentry Monitoring]
        BB[PostHog Analytics]
        CC[Cloudflare R2 Storage]
        DD[Mappls Maps API]
    end

    A --> L
    C --> M
    D --> N
    D --> O
    E --> N
    I --> P
    F --> Q

    L --> X
    M --> W
    N --> W
    O --> Y
    P --> W
    Q --> W
    U --> Z
    T --> CC
```

---

## 5. Database Schema — Entity Relationship Diagram

```mermaid
erDiagram
    PROFILES {
        uuid id PK
        text full_name
        text avatar_url
        date date_of_birth
        text phone_number
        enum role "user | host | admin"
        timestamp created_at
    }

    WORKSHOPS {
        uuid id PK
        text title
        text description
        text category
        decimal price
        text location
        text city
        text duration
        date date
        text time
        int max_seats
        int seats_remaining
        text cover_image
        text[] gallery_images
        text video_url
        jsonb social_links
        text host_name
        text host_bio
        uuid host_id FK
        uuid host_user_id FK
        float latitude
        float longitude
        text event_address
        boolean is_bestseller
        boolean is_new
    }

    HOSTS {
        uuid id PK
        uuid user_id FK
        text name
        text bio
        text avatar_url
        jsonb social_links
    }

    HOST_APPLICATIONS {
        uuid id PK
        uuid user_id FK
        text name
        text email
        text bio
        text application_type
        jsonb details
        enum status "pending | approved | rejected"
    }

    BOOKING_HOLDS {
        uuid id PK
        uuid user_id FK
        uuid workshop_id FK
        int guests
        enum status "active | confirmed | expired | released"
        timestamp expires_at
    }

    BOOKINGS {
        uuid id PK
        uuid user_id FK
        uuid workshop_id FK
        uuid hold_id FK
        int guests
        decimal subtotal
        decimal service_fee
        decimal total
        enum status "confirmed | cancelled | refunded"
        text payment_provider
        text payment_intent_id
        text first_name
        text last_name
        text email
        boolean attended
    }

    HOST_EARNINGS {
        uuid id PK
        uuid host_id FK
        uuid booking_id FK
        decimal amount
        decimal fee_deducted
        enum status "pending | available | paid"
    }

    PAYOUTS {
        uuid id PK
        uuid host_id FK
        decimal amount
        enum status "processing | completed"
    }

    USER_FAVORITES {
        uuid id PK
        uuid user_id FK
        uuid workshop_id FK
    }

    WORKSHOP_FEEDBACK {
        uuid id PK
        uuid user_id FK
        uuid workshop_id FK
        int rating
        text comment
        text[] photos
    }

    WAITLISTS {
        uuid id PK
        uuid workshop_id FK
        uuid user_id FK
        text email
        enum status "pending | notified | joined"
    }

    PAYMENT_WEBHOOK_EVENTS {
        uuid id PK
        text provider
        text event_key
        text event_type
        jsonb payload
    }

    EMAIL_DELIVERY_LOGS {
        uuid id PK
        text recipient_email
        text subject
        text template_name
        enum status "pending | sent | failed"
    }

    PROFILES ||--o{ BOOKINGS : "makes"
    PROFILES ||--o{ BOOKING_HOLDS : "holds"
    PROFILES ||--o{ USER_FAVORITES : "favorites"
    PROFILES ||--o{ WORKSHOP_FEEDBACK : "reviews"
    PROFILES ||--o{ HOST_APPLICATIONS : "applies"
    WORKSHOPS ||--o{ BOOKINGS : "has"
    WORKSHOPS ||--o{ BOOKING_HOLDS : "has"
    WORKSHOPS ||--o{ WAITLISTS : "has"
    WORKSHOPS ||--o{ WORKSHOP_FEEDBACK : "receives"
    HOSTS ||--o{ WORKSHOPS : "creates"
    HOSTS ||--o{ HOST_EARNINGS : "earns"
    HOSTS ||--o{ PAYOUTS : "receives"
    BOOKINGS ||--o| HOST_EARNINGS : "generates"
```

---

## 6. Booking & Payment Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant API as API Server
    participant DB as Supabase DB
    participant RZ as Razorpay
    participant EM as Resend Email

    U->>FE: Select workshop, guests, date
    FE->>API: POST /api/bookings/hold
    API->>DB: RPC create_booking_hold()
    Note over DB: Atomically decrements<br/>seats_remaining &<br/>creates hold with 15-min expiry
    DB-->>API: hold_id
    API-->>FE: hold_id + expiry timer

    U->>FE: Fill guest info, proceed to pay
    FE->>API: POST /api/bookings/checkout
    API->>RZ: Create Razorpay Order
    RZ-->>API: order_id
    API-->>FE: order_id + key

    FE->>RZ: Open Razorpay Checkout Modal
    U->>RZ: Complete Payment
    RZ-->>FE: payment_id, signature

    FE->>API: POST /api/payments/razorpay (verify)
    API->>API: Verify HMAC signature
    API->>DB: RPC confirm_booking_from_hold()
    Note over DB: Updates hold → confirmed<br/>Creates booking record<br/>Creates host_earning entry
    DB-->>API: booking_id
    API->>EM: Send confirmation email
    EM-->>U: Booking Confirmation Email
    API-->>FE: Success + booking details

    Note over DB: CRON: Expired holds auto-release<br/>seats back to workshop
```

---

## 7. Host Onboarding & Earnings Flow

```mermaid
flowchart LR
    A[Creator/Venue visits<br/>Become a Host page] --> B{Application Type}
    B -->|Creator| C[Fill: Bio, Portfolio,<br/>Workshop Categories,<br/>Social Links]
    B -->|Venue/Space| D[Fill: Space Details,<br/>Capacity, Amenities,<br/>Location, Photos]

    C --> E[Submit Application]
    D --> E

    E --> F[Admin Reviews<br/>in Admin Panel]
    F -->|Approved| G[Profile role → host]
    F -->|Rejected| H[Notification sent]

    G --> I[Create Workshops<br/>via Host Dashboard]
    I --> J[Workshops go live<br/>on platform]
    J --> K[Users book<br/>workshops]
    K --> L[Earning created<br/>per booking]
    L --> M[Admin processes<br/>payout]
    M --> N[Host receives<br/>bank transfer]

    style A fill:#f9f,stroke:#333
    style G fill:#9f9,stroke:#333
    style N fill:#9f9,stroke:#333
```

---

## 8. Tech Stack Architecture

```mermaid
graph LR
    subgraph "Client Layer"
        A[Next.js 14<br/>App Router]
        B[React 18]
        C[TypeScript 5.7]
        D[Tailwind CSS 3.4]
        E[Framer Motion 11]
        F[Zustand 5<br/>State Mgmt]
    end

    subgraph "API Layer"
        G[Next.js API Routes]
        H[Zod Validation]
        I[Rate Limiting]
        J[Idempotency Keys]
    end

    subgraph "Data & Auth"
        K[Supabase PostgreSQL]
        L[Supabase Auth<br/>Email + Google OAuth]
        M[Row Level Security]
    end

    subgraph "Payments"
        N[Razorpay Gateway]
        O[Webhook Handlers]
        P[HMAC Verification]
    end

    subgraph "Infrastructure"
        Q[Vercel Deployment]
        R[Sentry Error Monitoring]
        S[PostHog Product Analytics]
        T[Resend Transactional Email]
        U[Cloudflare R2 Media]
        V[Mappls Location/Maps]
    end

    A --> G
    G --> K
    G --> L
    G --> N
    G --> T
    A --> R
    A --> S
```

---

## 9. Key Platform Features

```mermaid
graph TB
    subgraph "User Features"
        U1[🔍 Smart Search & Filters]
        U2[📍 City-based Discovery]
        U3[❤️ Favorites & Wishlists]
        U4[📋 Booking History]
        U5[⭐ Ratings & Reviews]
        U6[📧 Email Notifications]
        U7[🔔 Waitlist for Full Workshops]
        U8[👤 Profile Management]
    end

    subgraph "Host Features"
        H1[📝 Workshop Creation]
        H2[📊 Booking Dashboard]
        H3[💰 Earnings Tracking]
        H4[🏦 Payout Management]
        H5[📸 Media Upload]
        H6[🔗 Social Links]
        H7[✅ Attendee Check-in]
    end

    subgraph "Admin Features"
        A1[📈 Platform Analytics]
        A2[👥 Host Application Review]
        A3[🎪 Workshop Moderation]
        A4[💳 Payout Processing]
        A5[📧 Email Delivery Logs]
        A6[🔄 Workshop Registration]
    end
```

---

## 10. Revenue Model

```mermaid
pie title Revenue Streams
    "Service Fee per Booking" : 60
    "Host Listing Premium" : 15
    "Featured Placement" : 15
    "Venue Partnership" : 10
```

| Revenue Stream | Description | Model |
|---|---|---|
| **Service Fee** | Platform fee on each booking transaction | % of booking value |
| **Host Premium** | Premium listing features for hosts | Monthly subscription |
| **Featured Placement** | Promoted workshop slots on homepage | Pay-per-placement |
| **Venue Partnerships** | Commission on venue-hosted workshops | Revenue share |

---

## 11. Growth & Scalability Roadmap

```mermaid
timeline
    title OnlyWorkshop Growth Roadmap
    section Phase 1 - Foundation ✅
        Core Platform : Homepage, Explore, Workshop Detail
        Authentication : Email + Google OAuth via Supabase
        Payments : Razorpay Integration
        Booking Engine : Seat Holds + Confirmation Flow
        Admin Panel : Workshop & Booking Management
    section Phase 2 - Growth 🚧
        Host Onboarding : Creator & Venue Registration
        Host Dashboard : Earnings, Bookings, Workshop Mgmt
        User Reviews : Post-attendance Feedback System
        Waitlist System : Automatic Notification Queue
        Email Engine : Transactional emails via Resend
    section Phase 3 - Scale 📋
        AI Recommendations : Personalized Workshop Suggestions
        Multi-City Expansion : Tier 2 & Tier 3 Cities
        Mobile App : React Native or Flutter
        Corporate Workshops : B2B Team Building Packages
        Subscription Model : Monthly Workshop Passes
    section Phase 4 - Platform 🔮
        Live Streaming : Virtual/Hybrid Workshops
        Marketplace APIs : Third-party Integrations
        International : Expand to SEA Markets
        Creator Tools : Video Courses, Kits
        Community : Forums, Groups, Events
```

---

## 12. Future Technology Roadmap

### For Users

| Technology | Benefit | Impact |
|---|---|---|
| **AI-Powered Recommendations** | Personalized workshop suggestions based on interests & history | Higher engagement, repeat bookings |
| **Smart Search with NLP** | Natural language queries like "pottery classes this weekend near me" | Faster discovery, better UX |
| **AR/VR Previews** | Virtual tour of workshop spaces before booking | Increased confidence & conversions |
| **Push Notifications** | Real-time booking updates, new workshop alerts, waitlist notifications | Better retention |
| **Social Features** | Follow creators, share experiences, group bookings | Viral growth, community building |
| **Workshop Passes** | Monthly subscription for unlimited/discounted workshops | Revenue predictability, user loyalty |
| **In-App Messaging** | Direct chat between users and hosts | Better pre-booking experience |

### For Business Growth

| Technology | Benefit | Impact |
|---|---|---|
| **PostHog Analytics** | Product usage insights, conversion funnel tracking | Data-driven decisions |
| **Sentry Monitoring** | Real-time error tracking, performance monitoring | 99.9% uptime reliability |
| **Automated Payouts** | Scheduled host payouts with ledger tracking | Scalable host operations |
| **CRON Email Engine** | Automated reminders, follow-ups, re-engagement | Reduced no-shows, better retention |
| **Rate Limiting & Security** | Protection against abuse, DDoS, fraudulent bookings | Platform integrity |
| **CDN (Cloudflare R2)** | Fast global media delivery for workshop images & videos | Better performance worldwide |
| **Vercel Edge Network** | Global CDN + serverless deployment | Sub-second page loads globally |
| **CI/CD Pipeline** | Automated testing (Vitest + Playwright) and deployment | Rapid feature delivery |

---

## 13. Business Metrics Dashboard (Current Capabilities)

```mermaid
graph LR
    subgraph "Platform Metrics"
        M1["📊 Total Workshops Listed"]
        M2["📈 Active Bookings"]
        M3["💰 Total Revenue"]
        M4["⭐ Avg Workshop Rating"]
        M5["👥 Registered Users"]
        M6["🎨 Active Hosts"]
        M7["🏙️ Cities Covered"]
        M8["📧 Email Delivery Rate"]
    end

    subgraph "Growth Indicators"
        G1["📉 Conversion Rate<br/>(View → Book)"]
        G2["🔄 Repeat Booking Rate"]
        G3["📱 Mobile vs Desktop"]
        G4["🕐 Avg Session Duration"]
    end
```

---

## 14. Security & Compliance

| Layer | Implementation |
|---|---|
| **Authentication** | Supabase Auth (JWT tokens, email + OAuth) |
| **Authorization** | Row Level Security (RLS) policies in PostgreSQL |
| **API Security** | Rate limiting, idempotency keys, HMAC signature verification |
| **Payment Security** | PCI DSS compliant via Razorpay (no card data touches our servers) |
| **Data Validation** | Zod schema validation on all API inputs |
| **Error Monitoring** | Sentry for real-time error tracking |
| **HTTPS** | Enforced across all endpoints via Vercel |

---

## 15. Competitive Advantage

```mermaid
quadrantChart
    title Platform Positioning
    x-axis Low Tech --> High Tech
    y-axis Niche Focus --> Broad Market
    quadrant-1 Market Leaders
    quadrant-2 Niche Innovators
    quadrant-3 Traditional Players
    quadrant-4 Mass Market
    OnlyWorkshop: [0.75, 0.65]
    Eventbrite: [0.6, 0.8]
    BookMyShow: [0.7, 0.9]
    Local FB Groups: [0.2, 0.3]
    Instagram DMs: [0.15, 0.4]
    WhatsApp Groups: [0.1, 0.35]
```

**OnlyWorkshop's Edge:**
- **Vertical focus** on creative/hands-on workshops (not general events)
- **Purpose-built** booking flow with seat holds & real-time availability
- **Two-sided marketplace** with host earnings, payouts & analytics
- **India-first** with Razorpay, Mappls Maps, INR pricing
- **Modern tech stack** enabling rapid iteration and premium UX

---

> **Contact**: hello@onlyworkshop.com  
> **Website**: onlyworkshop.com
