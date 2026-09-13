# Homepage Video and Premium Animation Plan

## Goal

Upgrade the public website so the homepage feels premium by replacing the static hero background image with a lightweight landing video, while keeping the experience fast, mobile-compatible, accessible, and polished. Add refined animation effects on the homepage and workshop preview page without adding a new animation stack.

## Current Implementation Surface

- Homepage composition: `src/app/(public)/HomePageClient.tsx`
- Homepage hero: `src/components/home/HeroSection.tsx`
- Workshop preview page: `src/app/(public)/workshop/[id]/WorkshopClient.tsx`
- Workshop gallery: `src/app/(public)/workshop/[id]/WorkshopGallery.tsx`
- Workshop booking sidebar: `src/app/(public)/workshop/[id]/WorkshopBookingSidebar.tsx`
- Motion presets: `src/lib/motion-presets.ts`
- Global motion and visual helpers: `src/app/globals.css`
- Current homepage fallback image: `public/images/background.webp`

## Video Asset Requirements

Create a new `public/videos/` directory and add optimized hero video assets:

- `public/videos/home-hero.mp4`
- Optional but recommended: `public/videos/home-hero.webm`
- Optional mobile crop: `public/videos/home-hero-mobile.mp4`
- Poster/fallback image: keep using `public/images/background.webp` or add `public/images/home-hero-poster.webp`

Recommended export settings:

- Duration: 8-12 seconds, seamless loop.
- Audio: no audio track.
- Desktop resolution: 1600x900 or 1920x1080.
- Mobile resolution: 720x1280 or 720p vertical crop if the desktop crop looks weak on phones.
- Frame rate: 24fps.
- Target size: 1.5MB-4MB preferred, 5MB maximum.
- Codec: H.264 MP4 for compatibility, WebM as a lighter enhancement when available.

## Homepage Hero Changes

Update `HeroSection.tsx`:

- Replace the `next/image` background layer with a native `<video>` element.
- Use `autoPlay`, `muted`, `loop`, and `playsInline`.
- Use `poster="/images/background.webp"` so the hero paints instantly while video metadata loads.
- Use `preload="metadata"` to avoid forcing a heavy download before the page is interactive.
- Keep the existing image as fallback for reduced-motion users, video load failures, or devices where autoplay is blocked.
- Keep existing overlays: dark gradient, subtle mesh, grain, and scroll parallax.
- Add a video-loaded state so the video fades in smoothly over the poster.
- Keep headline, badge, CTA, and scroll indicator animations using the existing Framer Motion presets.

Mobile-specific behavior:

- Use `object-cover` and a mobile-safe `object-position`.
- If using a mobile-specific file, choose it with a media query or a small client-side source switch.
- Keep the hero height based on safe viewport units where possible so mobile browser chrome does not cause clipping.
- Make sure hero text and CTA never overlap the scroll indicator or viewport edge.

## Homepage Animation Changes

Use the existing `framer-motion`, `ScrollReveal`, and `motion-presets.ts` setup. No new dependency is required.

Recommended effects:

- Hero video fade-in after load.
- Hero content stagger: badge, headline words, subtitle, CTA.
- Premium scroll reveal for homepage sections with subtle fade-up and scale.
- Workshop cards: staggered reveal, gentle hover lift, image zoom/pan.
- Special event banner: soft entrance with slight scale.
- Community gallery: staggered tile reveal.
- Host CTA: fade-up with restrained background/CTA motion.

Animation limits:

- Use short durations: 0.25s-0.7s.
- Avoid large translations and dramatic scaling.
- Respect `prefers-reduced-motion` everywhere.
- Do not animate layout dimensions in ways that cause content shift.

## Workshop Preview Page Changes

Update `WorkshopClient.tsx`, `WorkshopGallery.tsx`, and sidebar/mobile booking components:

- Add staggered entrance for the title, metadata chips, gallery, detail sections, and booking sidebar.
- Keep `WorkshopGallery` as the visual anchor and improve its entrance with fade-up plus slight scale.
- Add refined image hover effects using existing CSS helpers such as image hover zoom/pan.
- Animate the sticky booking sidebar with the existing `slideInRight` preset.
- Animate the mobile booking bar with a slide-up/fade-in effect.
- Keep the video modal animation lightweight and accessible.
- Ensure animations do not affect booking controls, coupon fields, waitlist modals, or keyboard focus behavior.

## Performance Requirements

- Hero video must not block first paint.
- Poster image must display immediately.
- Video should not be imported into JavaScript; it should be served from `public/videos/`.
- Do not add a custom video player library.
- Do not autoplay audio.
- Avoid loading desktop and mobile videos at the same time.
- Keep LCP-friendly structure: text and poster should render before the video fully loads.
- Use the current static image fallback if video fails.

## Accessibility Requirements

- Decorative hero video should be hidden from assistive tech with `aria-hidden="true"`.
- The hero text and CTA remain real accessible content.
- Respect `prefers-reduced-motion` by showing the poster instead of motion-heavy video/animation.
- Keep video muted because autoplaying video with sound is disruptive and often blocked.
- Preserve keyboard handling for workshop video and waitlist modals.

## Verification Checklist

Run these checks after implementation:

- `npm run typecheck`
- `npm run lint`
- Start the dev server with `npm run dev`
- Verify homepage desktop viewport.
- Verify homepage mobile viewport.
- Verify workshop preview desktop viewport.
- Verify workshop preview mobile viewport.
- Confirm the poster appears immediately before the video loads.
- Confirm the video is muted, loops, and plays inline on mobile.
- Confirm the page still works when the video file is unavailable.
- Confirm reduced-motion users get a static, usable experience.
- Confirm no text overlaps on mobile.
- Confirm booking/sidebar controls remain usable on workshop pages.

## Suggested Implementation Order

1. Add optimized video assets to `public/videos/`.
2. Update `HeroSection.tsx` to support video, poster, fallback, and reduced motion.
3. Tune homepage hero mobile sizing and overlays.
4. Add/adjust homepage section animation wrappers.
5. Add workshop preview staggered section animations.
6. Add mobile booking bar entrance polish.
7. Run typecheck, lint, and browser verification.
