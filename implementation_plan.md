# Upgrade Node.js & All Dependencies to Latest

Upgrade the workshop platform from its current dependency stack to the latest stable versions across Node.js, Next.js, React, Tailwind CSS, TypeScript, ESLint, and all supporting libraries.

## Current State

| Technology | Current | Target |
|:---|:---|:---|
| **Node.js** | v22.22.1 | **v24 LTS** (Active LTS) |
| **npm** | v10.9.4 | latest (bundled with Node 24) |
| **Next.js** | ^14.2.35 | **^15.x** (see note below) |
| **React / React DOM** | ^18.3.1 | **^19.2.6** |
| **TypeScript** | ^5.7.2 | **^5.8.x** (see note) |
| **Tailwind CSS** | ^3.4.16 | **^4.3.0** |
| **ESLint** | ^8.57.0 | **^9.x** (flat config) |
| **framer-motion** | ^11.15.0 | **^12.38.0** (rebranded to `motion`) |
| **Sentry** | ^10.22.0 | **^10.53.1** |
| **Supabase** | ssr ^0.5.2 / js ^2.45.0 | ssr ^0.10.3 / js ^2.105.4 |
| **Resend** | ^4.8.0 | **^6.12.3** |
| **tailwind-merge** | ^2.6.0 | **^3.6.0** |
| **Zod** | ^4.3.6 | **^4.4.3** |
| Others | various | latest |

---

## User Review Required

> [!IMPORTANT]
> **Next.js 15 vs 16**: Next.js 16 introduces radical changes (`middleware.ts` → `proxy.ts`, Turbopack-only, `use cache` directives). I **strongly recommend upgrading to Next.js 15 first** (still maintained), stabilize, and then plan a separate Next.js 16 migration later. Jumping to 16 in one shot with all other upgrades is extremely high risk.

> [!IMPORTANT]
> **TypeScript 5.8 vs 6.0**: TypeScript 6.0 changes defaults (`strict: true` by default, `types: []` by default, `target: es5` deprecated). Since your project already uses strict mode and modern settings, TS 6 _should_ work, but I recommend **staying on 5.8.x** to avoid surprise regressions while upgrading everything else. We can upgrade TS separately after stabilizing.

> [!WARNING]
> **Tailwind CSS v3 → v4**: This is the most invasive change. Your `tailwind.config.ts` (192 lines of custom theme: colors, fonts, animations, keyframes) needs to be migrated to CSS `@theme` syntax. The upgrade tool (`npx @tailwindcss/upgrade`) handles most of it, but custom animations and keyframes may need manual fixes.

> [!WARNING]
> **Vercel Deployment**: After upgrading, the `engines.node` field and Vercel's Node.js version setting must be updated to match Node 24. Verify Vercel supports Node 24 before deploying.

---

## Open Questions

1. **Next.js version**: Do you want to go to **Next.js 15** (recommended, stable) or jump directly to **Next.js 16** (cutting edge, more risk)?
2. **TypeScript version**: Stay on **5.8.x** (safe) or go to **6.0** (new defaults, some deprecated features)?
3. **Node.js installation**: Do you already have Node.js 24 installed, or should I guide you through installing it (via `nvm-windows` or direct download)?
4. **Vercel compatibility**: Are you deploying to Vercel? If so, have you confirmed Node 24 is supported in your plan?

---

## Proposed Changes (7 Phases)

### Phase 1: Node.js & npm Upgrade
**Risk: Low** — External to codebase

1. Install Node.js 24 LTS (manually or via nvm-windows)
2. Update `engines` field in `package.json`

#### [MODIFY] [package.json](file:///d:/Users/Chait/Pratice/tts/workshop/app/package.json)
- Change `"node": ">=18.17 <24"` → `"node": ">=22.13 <26"`

---

### Phase 2: React 18 → 19 & Next.js 14 → 15
**Risk: Medium-High** — Async APIs, params changes, React 19 type changes

#### Breaking Changes to Address:
1. **Async Request APIs**: `cookies()`, `headers()`, `params`, `searchParams` are now async — must be `await`ed
2. **`forwardRef` no longer needed** in React 19 (but still works)
3. **React types** change from `@types/react@18` to `@types/react@19`

#### Files Requiring Async API Migration:

##### [MODIFY] [supabase-rsc.ts](file:///d:/Users/Chait/Pratice/tts/workshop/app/src/lib/supabase-rsc.ts)
- `const cookieStore = cookies()` → `const cookieStore = await cookies()`
- `createSupabaseRscClient()` → `async createSupabaseRscClient()`

##### [MODIFY] [callback/route.ts](file:///d:/Users/Chait/Pratice/tts/workshop/app/src/app/api/auth/callback/route.ts)
- `const cookieStore = cookies()` → `const cookieStore = await cookies()`

##### ~20 API Route files with `params`:
All files under `src/app/api/**/**/route.ts` that use `{ params: { id: string } }` need:
```diff
-export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
+export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
+    const { id } = await params;
```

**Files affected (non-exhaustive):**
- `api/workshops/[id]/route.ts`
- `api/workshops/[id]/waitlist/route.ts`
- `api/workshops/[id]/feedback/route.ts`
- `api/workshops/[id]/notifications/route.ts`
- `api/workshops/[id]/public-feedback/route.ts`
- `api/admin/workshops/[id]/route.ts`
- `api/admin/workshops/[id]/approve/route.ts`
- `api/admin/workshops/[id]/reject/route.ts`
- `api/admin/workshops/[id]/attendees/route.ts`
- `api/admin/feedback/[id]/route.ts`
- `api/admin/faqs/[id]/route.ts`
- `api/admin/community-photos/[id]/route.ts`
- `api/admin/bookings/[id]/check-in/route.ts`
- `api/admin/host-applications/[id]/approve/route.ts`
- `api/admin/host-applications/[id]/reject/route.ts`
- `api/host/workshops/[id]/attendees/route.ts`
- `api/host/chatbot/faqs/[id]/route.ts`
- `api/host/bookings/[id]/check-in/route.ts`
- `api/coupons/[id]/route.ts`
- `api/communities/[slug]/join/route.ts`

##### Page components with `params`/`searchParams`:
- `(public)/workshop/[id]/page.tsx` — `params` now `Promise`
- `(public)/communities/[slug]/page.tsx` — `params` now `Promise`
- `(public)/explore/page.tsx` — `searchParams` now `Promise`
- `(private)/admin/workshops/[id]/attendees/page.tsx`
- `(private)/host/workshops/[id]/attendees/page.tsx`
- `(private)/communities/[slug]/join/page.tsx`
- `(private)/chatbot/embed/page.tsx` — `searchParams` now `Promise`

##### [MODIFY] [next.config.mjs](file:///d:/Users/Chait/Pratice/tts/workshop/app/next.config.mjs)
- Update Sentry config for Next.js 15 compatibility
- Review `experimental` options

##### [MODIFY] [package.json](file:///d:/Users/Chait/Pratice/tts/workshop/app/package.json)
- `next` → `^15.x`
- `react`, `react-dom` → `^19.2.6`
- `@types/react` → `^19.2.14`
- `@types/react-dom` → `^19.2.3`
- `eslint-config-next` → `^15.x`

---

### Phase 3: Tailwind CSS v3 → v4
**Risk: High** — Completely new architecture

#### Key Changes:
1. **PostCSS plugin** → `@tailwindcss/postcss`
2. **Config** from `tailwind.config.ts` → CSS `@theme` directives
3. **Imports** from `@tailwind base/components/utilities` → `@import "tailwindcss"`
4. **autoprefixer** no longer needed (built-in)
5. **`tailwind-merge`** v2 → v3 (required for TW v4 compatibility)

#### Strategy:
Run `npx @tailwindcss/upgrade` automated migration tool first, then manually fix:
- Custom color palette (cream, terracotta, clay, dark, forest, sand)
- Custom font families (playfair, inter, display)
- Custom animations & keyframes (13 animations, 12 keyframes)
- Custom box-shadow values

##### [DELETE] [tailwind.config.ts](file:///d:/Users/Chait/Pratice/tts/workshop/app/tailwind.config.ts)
- Migrated to CSS-first configuration

##### [MODIFY] [postcss.config.mjs](file:///d:/Users/Chait/Pratice/tts/workshop/app/postcss.config.mjs)
- Replace `tailwindcss` and `autoprefixer` with `@tailwindcss/postcss`

##### [MODIFY] [globals.css](file:///d:/Users/Chait/Pratice/tts/workshop/app/src/app/globals.css)
- Replace `@tailwind` directives with `@import "tailwindcss"`
- Add `@theme` block with all custom tokens

##### [MODIFY] [package.json](file:///d:/Users/Chait/Pratice/tts/workshop/app/package.json)
- Replace `tailwindcss` with `tailwindcss@^4.3.0`
- Add `@tailwindcss/postcss`
- Remove `autoprefixer`
- Update `tailwind-merge` to `^3.6.0`

---

### Phase 4: ESLint 8 → 9 (Flat Config)
**Risk: Medium** — Config format change, but straightforward

#### Changes:
1. Migrate `.eslintrc.json` → `eslint.config.mjs` (flat config)
2. Update `eslint-config-next` to v15 (supports flat config)
3. Remove `eslint-config-prettier` (integrate into flat config)

##### [DELETE] [.eslintrc.json](file:///d:/Users/Chait/Pratice/tts/workshop/app/.eslintrc.json)

##### [NEW] [eslint.config.mjs](file:///d:/Users/Chait/Pratice/tts/workshop/app/eslint.config.mjs)
```js
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

export default [
    ...compat.extends("next/core-web-vitals", "prettier"),
    {
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": "off",
        },
    },
];
```

##### [MODIFY] [package.json](file:///d:/Users/Chait/Pratice/tts/workshop/app/package.json)
- `eslint` → `^9.x`
- `eslint-config-next` → `^15.x`
- Add `@eslint/eslintrc` for FlatCompat

---

### Phase 5: Other Dependency Upgrades
**Risk: Low-Medium**

#### [MODIFY] [package.json](file:///d:/Users/Chait/Pratice/tts/workshop/app/package.json)

| Package | Change | Breaking? |
|:---|:---|:---|
| `@sentry/nextjs` | ^10.22 → ^10.53 | No (minor) |
| `@supabase/ssr` | ^0.5.2 → ^0.10.3 | Minor (cookie API refinements) |
| `@supabase/supabase-js` | ^2.45 → ^2.105 | No (minor) |
| `@react-email/components` | ^0.0.25 → ^1.0.12 | **Yes (major)** — API may change |
| `@react-email/render` | ^1.4 → ^2.0.8 | **Yes (major)** — Check render API |
| `resend` | ^4.8 → ^6.12 | **Yes (major)** — Check send API |
| `framer-motion` | ^11.15 → ^12.38 | No (drop-in for React users) |
| `lucide-react` | ^0.460 → ^1.16 | **Yes (major)** — Icon names may change |
| `posthog-js` | ^1.285 → ^1.373 | No (minor) |
| `sharp` | ^0.34.5 | No change needed |
| `clsx` | ^2.1.1 | No change needed |
| `zod` | ^4.3.6 → ^4.4.3 | No (minor) |
| `postcss` | ^8.4.49 → ^8.5.14 | No (minor) |
| `prettier` | ^3.6.2 → ^3.8.3 | No (minor) |
| `lint-staged` | ^16.2.3 → ^17.0.5 | Check (major) |
| `husky` | ^9.1.7 | No change needed |

#### Potential breaking changes to investigate:
- **@react-email/components v1**: Review component API changes
- **resend v6**: Check `emails.send()` signature
- **lucide-react v1**: Some icon names may have been renamed

---

### Phase 6: framer-motion → motion (Optional)
**Risk: Low** — Cosmetic rebranding

Optionally migrate from `framer-motion` to the new `motion` package:
1. `npm uninstall framer-motion && npm install motion`
2. Update all imports: `from "framer-motion"` → `from "motion/react"`
3. ~47 files use `framer-motion` imports

> [!NOTE]
> This is optional. `framer-motion` v12 works fine. The `motion` package is the new home but `framer-motion` continues to receive updates for now.

---

### Phase 7: TypeScript Upgrade
**Risk: Low** (if staying on 5.8)

- Upgrade `typescript` to `^5.8.x`
- Update `@types/node` to `^22.x` (compatible with Node 24)

---

## Verification Plan

### Automated Tests
```powershell
# 1. Type checking
npm run typecheck

# 2. Lint check
npm run lint

# 3. Dev server smoke test
npm run dev  # verify no runtime errors

# 4. Production build
npm run build

# 5. Run existing tests
npm test  # if test runner exists
```

### Manual Verification
1. **Dev server**: Start `npm run dev`, navigate to homepage, workshop pages, admin dashboard
2. **Animations**: Verify framer-motion animations still work (hero, scroll reveals, page transitions)
3. **Auth flow**: Test login/logout, admin route protection
4. **Tailwind**: Visual regression check on all pages — colors, fonts, shadows, responsive layouts
5. **API routes**: Test workshop CRUD, booking flow, feedback submission
6. **Vercel deploy**: After local verification, deploy to staging and verify

### Risk Mitigation
- **Git branch**: All changes on a dedicated `upgrade/latest-deps` branch
- **Incremental approach**: Upgrade in phases, verify after each phase
- **Rollback**: If Tailwind v4 migration is too disruptive, we can keep v3 and upgrade everything else first
