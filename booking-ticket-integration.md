# Booking Ticket Integration

## Codebase structure

- `app/src/app/booking/page.tsx`
  - Owns the booking screen state and decides when to show the confirmation view.
- `app/src/app/booking/BookingConfirmation.tsx`
  - Renders the post-payment confirmation layout and now embeds the ticket UI.
- `app/src/app/booking/WorkshopTicket.tsx`
  - Reusable ticket-style component used by both booking confirmation and profile.
- `app/src/app/booking/types.ts`
  - Defines `ConfirmedBooking` and `BookingFormData`, which are the main booking-side data contracts.
- `app/src/app/profile/page.tsx`
  - Loads bookings from `/api/bookings` and renders saved tickets in the user profile.
- `app/src/app/api/bookings/route.ts`
  - Returns booking rows plus workshop metadata required by the profile ticket view.
- `app/src/lib/calendar.ts`
  - Generates ICS and Google Calendar links for the confirmation state.
- `app/tailwind.config.ts`
  - Defines the warm brand palette and typography used by the ticket component.

## Booking flow

1. `page.tsx` loads workshop data and drives the checkout workflow with `useBookingWorkflow`.
2. Once checkout succeeds, `ConfirmedBooking` provides canonical booking fields such as `id`, `total`, and workshop summary data.
3. `page.tsx` also enriches the confirmation UI with attendee-facing values not guaranteed by `ConfirmedBooking`, including:
   - attendee name from `BookingFormData`
   - display location from the workshop page data
   - workshop id for deep-link sharing
4. `BookingConfirmation.tsx` renders the success screen, calendar actions, and `WorkshopTicket`.
5. The profile page independently reloads bookings from `/api/bookings` and renders the same ticket component for saved bookings.

## Data model notes

### `Workshop`

The workshop shape used by booking and profile pages includes the fields needed to render ticket metadata:

- `id`
- `title`
- `date`
- `time`
- `location`
- `city`
- `cover_image`

### `ConfirmedBooking`

`ConfirmedBooking` is intentionally minimal and is best for immediate post-checkout rendering:

- `id`
- `total`
- `workshop.title`
- `workshop.date`
- `workshop.time`
- `workshop.cover_image`

Because it does not guarantee attendee name or full location details, `page.tsx` now passes those values separately into `BookingConfirmation`.

### `BookingFormData`

`BookingFormData` remains the source of truth for the attendee identity collected during checkout:

- `firstName`
- `lastName`
- `email`
- `phone`
- `notes`

The confirmation page combines `firstName` and `lastName` into the ticket holder name shown immediately after purchase.

## Design tokens used

The ticket design follows the existing Tailwind theme in `app/tailwind.config.ts`:

- Palette:
  - `cream` for the base canvas and soft surfaces
  - `terracotta` for the ticket header, accents, and action hover states
  - `clay` for muted image fallbacks
  - `dark.text`, `dark.secondary`, and `dark.muted` for readable hierarchy
- Typography:
  - `font-display` / `display` maps to Playfair for the workshop title and amount
  - `font-inter` is used for labels, metadata, and action buttons
- Elevation and shape:
  - `shadow-card` for the ticket shell
  - `rounded-2xl` and the larger custom radius for the punched ticket silhouette

## Implementation plan

1. Build a reusable `WorkshopTicket` component that does not depend on booking-page-only state.
2. Extend `BookingConfirmation` so it passes booking id, attendee name, location, cover image, and total paid.
3. Harden calendar date handling to avoid brittle timestamp formatting and ambiguous timezone parsing.
4. Reuse the same ticket UI in the profile page by mapping `/api/bookings` data into the ticket prop shape.
5. Verify data flow with focused tests and typechecking.

## Implemented changes

- Added a reusable ticket-style `WorkshopTicket` with:
  - attendee name
  - venue and schedule metadata
  - derived ticket number
  - booking id and paid amount
  - social actions for WhatsApp, Twitter, copy link, and native share
- Updated `BookingConfirmation.tsx` to pass:
  - `bookingId`
  - `workshopId`
  - `attendeeName`
  - `location`
  - `workshopCoverImage`
  - `totalPaid`
- Reworked calendar formatting in `calendar.ts` so it:
  - formats UTC timestamps without relying on `.replace(/[-:]/g, "")`
  - accepts explicit timezone offsets when present
  - falls back to local wall-clock parsing for ambiguous date and time strings
- Updated the profile page to derive:
  - attendee name from `first_name` and `last_name`
  - venue label from `location` and `city`
  - ticket cover, guests, amount, and workshop id from the booking response

## Profile ticket integration

The saved-ticket flow now works like this:

1. `app/src/app/api/bookings/route.ts` returns each booking with:
   - `id`
   - `guests`
   - `total`
   - `created_at`
   - `first_name`
   - `last_name`
   - nested `workshop.id`
   - nested `workshop.title`
   - nested `workshop.date`
   - nested `workshop.time`
   - nested `workshop.location`
   - nested `workshop.city`
   - nested `workshop.cover_image`
2. `getMyBookings()` in `api-client.ts` exposes that payload to the profile page.
3. `profile/page.tsx` maps each booking into `WorkshopTicket` props.
4. The same component used on the confirmation page is rendered in the profile `tickets` tab, keeping the UI consistent across both entry points.

## Verification

- Focused Vitest coverage passed for calendar utilities, API client helpers, profile route, upload route, host attendee access, and booking workflow.
- `npx tsc --noEmit --pretty false` passed after the ticket integration and API client cleanup.
