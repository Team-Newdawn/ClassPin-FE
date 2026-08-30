# Participant question sorting and live controls verification

- Task: `participant-question-sorting-and-live-controls`
- Requirements: `CLASS-JOIN-002`, `CLASS-LIVE-001`, `CFA-010`, `CFA-020`,
  `CFA-035`, `CFA-042`, `CFA-053`, `CFA-056`, `CFA-064`, `CFA-080`,
  `CFA-081`, `CFA-082`, `CFA-083`, `CFA-087`

The participant controller keeps the current-slide question collection as the
authoritative rendering input and derives a sorted copy for the list. The
native select switches between deterministic empathy and newest comparators;
the list viewport fits four 80px cards with three 8px gaps and scrolls any
remaining questions internally. Narrow, low-height screens use document
scrolling so the list remains reachable at 200% zoom.

The admin stage toolbar now owns a native QR placement select with `QR 없애기`
and the four corners beside the existing slide actions. The old interaction and
QR sections are absent from the right panel. Its remaining live-question switch
updates `showQuestionPins`, while QR visibility and position are stored together
through one existing lecture update. Presentation Emoji subscription/rendering
is independent of both settings. No migration, RPC, dependency, or additional
network request was added.

Browser verification used Chrome at 1512×861 with a demo live session containing
six current-slide questions, distinct empathy counts and timestamps, plus the
legacy `presentationInteractions: false` value:

- `/join/SORTDEMO` opened in empathy order `1, 3, 5, 2, 4, 6`; changing the
  accessible sort select to Newest immediately changed it to `6, 5, 4, 3, 2, 1`
- the desktop screenshot showed exactly four question cards in the list viewport;
  the accessibility tree retained all six items for internal scrolling
- the participant toolbar exposed exactly PIN and Emoji
- at Chrome 200% zoom the page did not overlap controls; PageDown reached the
  question header, select and four-card viewport, then zoom was reset to 100%
- `/admin/session/session-demo` placed the QR select in the same toolbar row as
  Add slides/Delete and exposed only the Live questions switch above the list
- selecting Hide QR survived a reload; selecting Top right restored QR without
  changing the PIN switch
- the PIN switch changed from on to off and removed slide PINs; the presentation
  then contained no PIN controls or PIN status
- after turning PINs back on, `/present` showed all six PINs and the top-right QR
  even though the legacy interaction flag was false, proving direct PIN control
  and QR independence
- the question-panel separator changed from 380px to 359px with the keyboard,
  and the folder rail collapsed to its accessible Expand control

Verification commands:

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean replay of every migration passed before final
  UI-only review; the active task added no schema change
- `node --experimental-strip-types --test app/_model/question-reactions.test.ts app/_model/participant-question.test.ts app/_model/class/session.test.ts app/_model/class/presentation-rotation.test.ts app/_model/i18n.test.ts app/_model/class-folders.test.ts` — 14/14 passed
- `npx tsc --noEmit` — passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning for
  `next.config.ts` / `app/api/convert/route.ts`
- `git diff --check` — passed
- document manifest, Direct-Strict governance, task lock, context pack and final
  `docflow verify` — passed; `check-run --audit` reported no run file because
  this documented change used direct implementation with user-requested parallel
  task agents rather than a formal orchestrated run
- Ponytail review removed unused interaction/QR/Emoji copy and found no extra
  abstraction or dependency to cut; final result: `Lean already. Ship.`

## Highlight clipping regression

The empathy highlight keeps the four-card content viewport, but the scroll box
now includes a 12px vertical and 16px horizontal effect gutter. Question cards
allow their decorative fire layer to overflow into that gutter. Chrome's
iPhone 12 Pro viewport confirmed that the fire glyphs and orange glow render on
all sides without being cut while six questions remain internally scrollable.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- the approved PRD and frontend architecture SHA-256 values match the active
  context lock; automated `docflow` replay is unavailable because the
  user-requested harness removal deleted `.document-driven/bin/docflow.py`
- Ponytail review found the two CSS ownership changes lean; no wrapper,
  dependency, JavaScript state, or new selector was added
