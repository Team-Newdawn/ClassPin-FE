# Public live presentation evidence

- Task: `public-live-presentation`
- Requirements: `CFA-010`, `CFA-053`, `CFA-059`, `CFA-061`, `CFA-063`, `CFA-081`, `CFA-082`, `CFA-086`, `CFA-087`
- Route: `/admin/session/[id]/present`

## Implementation boundary

- `app/(view)/admin/layout.tsx` exempts only the exact presentation route from the admin redirect.
- `app/(view)/admin/session/[id]/present/controller.ts` loads a missing live session through the audience path and exposes slide controls only to the owning admin path.
- `app/_controller/session-store.tsx` merges concurrent public lookups by code or id and preserves one active-session Realtime subscription.
- `app/_service/class-session-service.ts` reuses the audience client and live-session RLS for id lookup. The audience projection does not select `slide_instructor_notes` or populate `speakerNote`.
- No dependency, schema, RPC, RLS, or CSS change was added for this route change.

## Verification

- `npm run supabase:start` — local stack running.
- `npm run supabase:reset` — clean replay passed through `20260904034311_enforce_public_lecture_slides.sql`.
- `supabase test db supabase/tests/public_lecture_slides.sql --local` — 1/1 passed.
- Focused Node model tests — 16/16 passed.
- `npm run lint` — passed.
- `npm run build` — passed; `/admin/session/[id]/present` compiled as a dynamic route.

Using a fresh headless Chrome profile against the local Supabase stack and a live one-slide fixture:

- The requested presentation URL remained unchanged instead of redirecting to `/login`.
- The presentation shell rendered and its single slide image completed with a non-zero natural width.
- The anonymous view rendered zero previous/next write controls.
- The sibling `/admin/session/[id]` route redirected to `/login?next=...`, confirming the exception did not widen the rest of the admin tree.
- A direct anonymous REST attempt to update `lectures.current_page` returned no rows, and the database value remained `0`.

## Production deployment

- Cloud Build `cdf2be15-98e0-4224-aa55-3137de092451` completed successfully.
- Cloud Run revision `pin-class-00092-rgq` became ready and received 100% of traffic.
- A fresh Chrome profile opened the exact production presentation URL without a login redirect or login button.
- The production presentation shell rendered in read-only mode, and its Supabase slide image completed at a natural width of 1600px.
