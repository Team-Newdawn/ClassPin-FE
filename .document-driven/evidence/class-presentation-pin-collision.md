# Class presentation PIN collision evidence

- Date: 2026-08-28
- Requirement: `CLASS-PRES-001`
- Browser: Orca workspace browser, isolated demo server at `http://localhost:3011`

## Automated verification

- `node --test lib/pin/presentation-rotation.test.ts` passed all 5 tests.
- The existing collision test spread 30 PINs sharing the same center or edge coordinate without overlap and kept every position within the canvas.
- `npm run lint` passed.
- `npm run build` passed with the pre-existing Turbopack NFT warning for `app/api/convert/route.ts`.

## Browser verification

- Loaded a temporary Class presentation with 12 point PINs sharing `x: 0.5`, `y: 0.5` and long question bodies.
- At the sampled autoplay state, 6 rendered PINs produced 5 displacement lines and 0 pairwise PIN collisions.
- Of 6 rendered speech bubbles, 5 colliding inactive bubbles were hidden, the active bubble remained visible, and the retained bubbles had 0 pairwise collisions.
- The temporary demo server and data were isolated from the workspace's configured Supabase environment.

## Numberless PIN and speech-bubble priority regression

- Date: 2026-08-30
- The presentation canvas hides the visual number inside standard blue point PINs while preserving each button's question-based accessible name. Emoji PINs are unchanged.
- Speech-bubble retention now runs through the pure `resolveVisiblePresentationLabelIds` selector. The current/new PIN label is evaluated first; an older label is omitted when it intersects another PIN or a retained label. Point PIN geometry is marker-agnostic, so standard and Emoji PINs follow the same rule.
- The visible overlap was traced to the presentation bubble's explicit `display: block` overriding the browser's `hidden` rendering. A scoped `[hidden] { display: none; }` rule now makes the selector result authoritative.

Browser verification used Chrome at 1512×861 with an isolated demo session containing eight nearly coincident point PINs: two standard blue PINs and six Emoji PINs. At the fully accumulated autoplay frame, all eight PINs remained visible, both blue PINs had no number, and only the newest speech bubble was rendered. Screenshot: `/var/folders/2l/brg8t5z918bc9jrvdb20gwr00000gn/T/orca-computer-use/1fad1e35-e8a1-4e25-892a-a57180692ab2-screenshot.png`.

- `node --experimental-strip-types --test app/_model/class/presentation-rotation.test.ts app/_model/question-reactions.test.ts app/_model/participant-question.test.ts app/_model/class/session.test.ts app/_model/i18n.test.ts app/_model/class-folders.test.ts` — 15/15 passed
- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- `git diff --check` — passed
- Approved PRD, frontend architecture and manifest SHA-256 values match the active context lock. Automated `docflow` replay remains unavailable because the previously requested harness removal deleted `.document-driven/bin/docflow.py`; trace and hash checks were performed manually.
- Ponytail review: `Lean already. Ship.`
