# Public presentation slide sync evidence

- Task: `public-presentation-slide-sync`
- Requirements: `CFA-010`, `CFA-012`, `CFA-053`, `CFA-054`, `CFA-059`, `CFA-061`, `CFA-063`, `CFA-081`, `CFA-082`, `CFA-086`, `CFA-087`
- Date: 2026-09-04

## Root cause and implementation

- A two-slide live lecture already delivered owner `current_page` changes to an anonymous presentation through Realtime and the two-second audience snapshot poll.
- The public route still appeared fixed because `canControl` hid both side controls and returned before every keyboard navigation attempt.
- The presentation controller now keeps an audience-only viewed page. Arrow, Page, Home, End, Space, and visible side controls update only that route-local page.
- The owner-synchronized page remains the reset boundary when Realtime reports a new `current_page`; anonymous navigation never calls the owner mutation.

## Verification

- Pre-fix isolated-profile reproduction: ArrowRight left the counter at `1 / 2` instead of `2 / 2`.
- Post-fix isolated Chrome profile: initial `1 / 2`, two accessible side controls, ArrowRight changed to `2 / 2`, and the view remained on page 2 after the audience snapshot poll.
- After local anonymous navigation, Postgres `lectures.current_page` remained `0`.
- Owner updates `0 -> 1 -> 0` reset the same anonymous view to `1 / 2`, preserving live synchronization.
- Anonymous Supabase client read both slides, updated zero lecture rows, left `current_page = 0`, and read zero speaker notes.
- `npm run supabase:start` and clean `npm run supabase:reset` passed.
- `node --experimental-strip-types --test app/_model/class/presentation-rotation.test.ts` passed 7 tests.
- `npm run lint` passed.
- `npm run build` passed.
- `ponytail-review`: Lean already; no new dependency, service, migration, or CSS was added.
