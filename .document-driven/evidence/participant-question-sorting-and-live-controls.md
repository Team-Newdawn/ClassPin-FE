# Participant question sorting and live controls verification

- Task: `participant-question-sorting-and-live-controls`
- Requirements: `CLASS-JOIN-002`, `CLASS-LIVE-001`, `CFA-010`, `CFA-020`,
  `CFA-035`, `CFA-042`, `CFA-053`, `CFA-056`, `CFA-064`, `CFA-080`,
  `CFA-081`, `CFA-082`, `CFA-083`, `CFA-087`

The participant controller keeps the current-slide question collection as the
authoritative rendering input and derives a sorted copy for the list. The
native select switches between deterministic empathy and newest comparators;
the list viewport fits up to four complete compact cards and scrolls any
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

## Compact admin question cards

The live workspace question cards now use the requested compact hierarchy:
category at the upper left, answer status at the upper right, question content
in the middle, and the relative date at the lower right. Point/region context
remains at the lower left. The card padding was reduced from 16px to 12px and
the redundant date icon and nested copy wrapper were removed without changing
question data, selection, answer previews, or API calls.

Chrome at 1512×861 on `/admin/session/collision-demo` showed five complete cards
in the right panel. The selected and unselected variants both placed `미답변`
in the upper-right corner and `10시간 전` in the lower-right corner, while all
eight question buttons remained available through panel scrolling.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- the approved PRD and frontend architecture SHA-256 values match the active
  context lock; automated `docflow` replay is unavailable because the
  user-requested harness removal deleted `.document-driven/bin/docflow.py`
- Ponytail review removed a redundant footer minimum height; no dependency,
  JavaScript state, or abstraction was added

## Participant question list clipping regression

The four-card viewport previously assumed 80px rows, but a normal two-line
question renders at 89px. The list maximum is now 404px (four 89px cards, three
8px gaps and 24px effect gutters). On narrow screens the feedback panel uses
8px vertical padding so its list is not shrunk below that maximum by the fixed
viewport.

Chrome device emulation at 420×804 CSS pixels and 2× device scale measured a
403.75px list viewport. The first four 89px cards were fully inside its bounds;
the fifth card became fully visible after scrolling the list by its 97px maximum.
The narrow layout retains this 404px compact boundary. No component, controller,
model or API code changed.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `node --experimental-strip-types --test app/_model/question-reactions.test.ts app/_model/participant-question.test.ts` — 4/4 passed
- `npx tsc --noEmit` — passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- Ponytail review found the CSS-only fix lean; no new component, state,
  dependency or selector abstraction was added

## Desktop question panel full-height regression

The desktop list no longer inherits the compact 404px maximum. At 900px and
wider it now stretches through the feedback panel's remaining grid row and keeps
its native internal scrollbar. The compact maximum remains unchanged below the
desktop breakpoint.

Chrome at 2048×1166 with 48 questions measured a 1017px list viewport from the
question header to the panel's bottom padding. Scrolling reached question 48
with the complete last 89px card inside the viewport. At 420×804 and 2× device
scale the list remained capped at 404px. This fix adds one desktop CSS override
and no component, state, dependency, model or API change.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `node --experimental-strip-types --test app/_model/question-reactions.test.ts app/_model/participant-question.test.ts` — 4/4 passed
- `npx tsc --noEmit` — passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- Ponytail review: `Lean already. Ship.`

## Stage slide action button restyle

The existing slide-add and slide-delete controls keep their route controller,
SessionStore and service/RPC behavior. Only the route view and route-owned CSS
changed. Both controls now use the requested dark surface, 2px neutral border,
8px radius, 12px icon/text gap and 500 text weight without copying the supplied
absolute coordinates or button dimensions. Delete uses the provided
`assets/icons/delete_icon.svg` through the repository's existing static SVG
import pattern and retains the button's text accessible name.

The Orca browser tab for the reported session exposed separate `슬라이드 추가`
and `삭제` buttons. At a 1063px content width both remained 28px high; computed
styles reported `rgb(23, 29, 38)` backgrounds, 2px neutral borders and 12px
gaps. The delete asset rendered as a 14px-wide `aria-hidden` CSS mask colored by
the semantic error token, and hover used the same error border on the dark
surface. Screenshot capture was unavailable while the embedded tab was not
visible, so verification used the accessibility snapshot and live DOM/computed-
style measurements.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npx tsc --noEmit` — passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- Ponytail review removed three redundant CSS declarations; no new state,
  dependency, component abstraction or behavior was added

## Admin question page spacing regression

The route-owned CSS migration had omitted the existing question-page content
container rule. Restoring that rule gives the question tab a centered 1440px
maximum width with 32px vertical and 40px horizontal padding. The live player
keeps its edge-to-edge stage and resizable question-panel geometry because the
rule targets `.questions-page` rather than `main` or the shared workspace tabs.

In the reported Orca browser tab at 1291px wide, `.questions-page` measured from
`x=240` to `x=1291`; its first and last children measured from `x=280` to
`x=1251`, confirming 40px left and right insets. The first child began 32px
below the page and the last child ended 32px above its bottom. Switching to the
live tab preserved the 1051px workspace split as a 671px stage and 380px
question panel, with the existing `16px 24px 14px` stage padding. The
accessibility snapshot retained the named live/question tabs and all category
controls. Screenshot capture timed out because the embedded tab was not
visible, so verification used the live DOM rectangles and computed styles.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- the context lock, manifest, approved PRD/frontend-architecture hashes and every
  sharded trace path passed manual verification; `docflow.py` is not installed
  under the repository's Weak Harness policy
- no unit test was added for the single CSS declaration block; the approved
  browser geometry check is the regression verification
- Ponytail review: `Lean already. Ship.`

## Admin question filter row spacing

The question-list filter row now uses the design system's nearest spacing step,
16px, as top padding. No view markup, controller state, filtering behavior,
accessibility label, dependency or data path changed.

In the reported Orca browser tab at 1291px wide, `.filterbar` retained its
971px width and existing 16px bottom margin. Its computed top padding changed
from 0px to 16px, its height changed from 40px to 56px, and the first control's
top moved from `y=441` to `y=457`. The adjacent question table moved down by
the same 16px without changing its dimensions.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- the context lock, manifest, approved documents and sharded trace paths passed
  manual verification because the Weak Harness does not install `docflow.py`
- no unit test was added for the single CSS declaration; the browser geometry
  measurement is the regression verification
- Ponytail review: `Lean already. Ship.`

## Stage QR select and toolbar copy cleanup

The stage toolbar no longer renders the redundant current/total slide counter or
the student-screen synchronization copy. The existing QR icon, accessible native
select, option set, controller validation and single `updateLecture` persistence
request remain unchanged. Route-owned CSS gives the select a dark semantic
surface, 2px neutral border, 8px radius and CSS-only white chevron while keeping
the existing responsive 154×28 desktop geometry.

The reported Orca browser tab at 1291×805 confirmed that neither `4 / 15` nor
`수강생 화면과 동기화 중` remained in the toolbar. The QR icon stayed a 14px
`aria-hidden` SVG and the combobox retained its `슬라이드쇼 QR 위치` accessible
name. Computed styles reported a 154×28 box, `rgb(23, 29, 38)` background, 2px
neutral border, 8px radius, `appearance: none`, 600 text weight and a 2px white
CSS chevron. Selecting top-right survived reload; the setting was restored to
hidden after verification.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `node --experimental-strip-types --test app/_model/question-reactions.test.ts app/_model/participant-question.test.ts app/_model/class/session.test.ts app/_model/class/presentation-rotation.test.ts app/_model/i18n.test.ts app/_model/class-folders.test.ts` — 15/15 passed
- `npx tsc --noEmit` — passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- local browser regression pass confirmed `/` → `/login`, demo dashboard entry,
  folder open, list/grid switch, Insights, material reopen, rail collapse/expand,
  keyboard question-panel resize, note save/restore, a 623px filmstrip with
  1732px scroll width, and ArrowRight/ArrowLeft slide navigation 4 → 5 → 4
- approved PRD, frontend architecture and manifest SHA-256 values matched the
  active context lock; `docflow.py` is not installed under the Weak Harness
  policy
- Ponytail review: `Lean already. Ship.`
- Cloud Build `9d96165d-8611-4c08-84a7-507e356e37a5` — succeeded; image digest
  `sha256:5310d366dd2c45e2e7df243db860917c6f35213f6e51f0f79307a087cd55d367`
- Cloud Run revision `pin-class-00082-9j6` — ready and serving 100% of traffic;
  both the custom and Cloud Run domains redirected to `/login` and returned 200

## Selected and unselected PIN assets

Point PINs in the shared `SlideCanvas` now render the supplied
`assets/icons/pin_icon.svg` only for the selected question and
`assets/icons/pin_black_icon.svg` for unselected questions. The existing PIN
number, question mark, smile or lightbulb is overlaid inside the asset while the
button retains its question-text accessible name. Historical box and path
anchors keep their existing rendering.

Presentation playback holds each active PIN for three seconds. Opening a PIN's
question detail clears the playback interval; the interval is recreated when
the detail closes. The pure playback predicate covers PIN visibility, minimum
count and manual selection.

Chrome at 1512×861 confirmed that the admin canvas switched the selected demo
question from the blue numbered PIN to the blue question-mark PIN. The
presentation canvas showed one blue selected PIN and black unselected PINs with
their number/question/lightbulb markers inside. A manually selected question
remained active for more than one rotation interval while its detail was open,
then automatic rotation resumed after closing it.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `node --experimental-strip-types --test app/_model/class/presentation-rotation.test.ts` — 7/7 passed
- `node --experimental-strip-types --test app/_model/question-reactions.test.ts app/_model/participant-question.test.ts app/_model/class/session.test.ts app/_model/class/presentation-rotation.test.ts app/_model/i18n.test.ts app/_model/class-folders.test.ts` — 16/16 passed
- `npx tsc --noEmit` — passed
- `npm run lint -- --quiet` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- approved PRD and frontend architecture hashes matched the active context
  lock; `docflow.py` is not installed under the repository's Weak Harness policy
- Ponytail review reused the controller's existing normalized visibility flag;
  no new dependency, component layer or persistent state was added

## Folder and material search style parity

The dashboard folder search and folder-detail material search now get the same
250×44px geometry directly from the shared `AdminSearch` stylesheet. The two
duplicate route size blocks were removed; the dashboard keeps only its existing
mobile full-row override.

The reported Orca browser tab measured both searches at 250×44px. Their live
computed styles also matched at 18px horizontal padding, 2px `#A4A4A4` border,
6px radius, 12px gap and 16px/500 input typography.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint -- --quiet` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- no unit test was added for the CSS-only geometry change; browser computed-style
  comparison is the regression verification
- Ponytail review moved duplicated route geometry into the existing shared
  component stylesheet; no new component, dependency or state was added

## Sidebar language and account placement

The existing language switcher, account identity and configured logout action
now render at the bottom of the shared folder tree sidebar on both the dashboard
and folder-detail routes. At this stage the top workspace header was reduced to
an aria-hidden 84px spacer so the page content alignment did not shift. The
later full-bleed dashboard change below removes that spacer from the dashboard;
folder detail retains it. The folder not-found state, which has no folder
sidebar, retains the complete workspace header as its fallback.

The reported Orca browser tab at 1291×805 measured one `.workspace-account` on
both `/admin/dashboard` and `/admin/folders/unfiled`; in each route it was inside
the sidebar and no account remained in the header. The expanded footer stayed
flush with the sidebar bottom. In collapsed mode the sidebar remained 72px wide,
the KO/EN switch measured 52×32px, and the avatar remained a 32×32px reachable
identity cue. The accessibility tree retained the named language group and both
buttons. Switching to EN translated the interface, and KO was restored before
handoff.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint -- --quiet` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- final browser regression confirmed `/` → `/login`, dashboard entry, folder
  open, list/grid switch, Insights, material open, rail collapse/expand,
  keyboard question-panel resize, note save/clear/reload, a 623px filmstrip with
  1732px scroll width, and ArrowRight/ArrowLeft slide navigation 1 → 2 → 1
- no unit test was added for the component-placement and responsive CSS change;
  live DOM, computed geometry and accessibility snapshots are the regression
  verification
- Ponytail review replaced two independent header visibility flags with one
  `spacer` state and removed the unused CSS branch; no dependency, store state or
  data request was added

## Full-bleed dashboard workspace

The dashboard's white `admin-page` now fills the complete workspace beside the
folder sidebar. The empty 84px header spacer, card-like 24px outer gutter and
1440px maximum width were removed only from the dashboard; its existing
responsive content padding and folder-grid behavior remain intact. A follow-up
applies the requested 44px radius to this surface and the folder-detail file
workspace.

In the reported Orca browser tab the expanded layout measured the page from
`x=248, y=0` through the viewport's right and bottom edges. Its computed outer
margin was `0px`, border radius was `44px`, `max-width` was `none`, and the
existing 40px inner padding remained. The folder-detail workspace also reported
a `44px` radius. The accessibility tree retained the folder sidebar, language
controls, search, upload/create actions and folder links without an empty header
landmark.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint -- --quiet` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- no unit test was added for the route-owned layout-only CSS change; live DOM
  geometry and the accessibility snapshot are the regression verification
- Ponytail review: `Lean already. Ship.`

## Folder and file workspace background

The folder dashboard and folder-detail file page now share the requested
`#EEEEEE` outer workspace background through the semantic
`--color-folder-workspace-bg` token. Both route shells and their shared folder
sidebar consume the token, while the rounded content surfaces remain white and
unrelated login, live and participant routes keep the existing page background.

The reported Orca browser tab measured `rgb(238, 238, 238)` for the shell and
sidebar on `/admin/dashboard` and `/admin/folders/unfiled`; each page's content
surface remained `rgb(255, 255, 255)`.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `npm run lint -- --quiet` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- no unit test was added for the token-only CSS change; computed browser colors
  on both routes are the regression verification
- Ponytail review: `Lean already. Ship.`

## Presentation PIN-to-bubble spacing

The shared presentation bubble now uses one 34px horizontal offset: the 44px
PIN's 22px half-width plus a 12px body gap. Left- and right-facing bubbles use
the same magnitude, and the obsolete marker-specific offset overrides were
removed because every point marker now renders inside the same PIN asset.

The Orca browser at 1291×889 CSS pixels (2× device scale) created a default
numbered PIN at 25% of the slide and a smile PIN at 75%. Live DOM geometry
measured a 12px PIN-to-bubble-body gap for both the right-facing numbered bubble
and the left-facing smile bubble. Both used `--pin-bubble-offset: 34px`; their
9px speech tails were mirrored with the existing 45°/225° transforms.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `node --experimental-strip-types --test app/_model/class/presentation-rotation.test.ts` — 7/7 passed
- `npx tsc --noEmit` — passed
- `npm run lint -- --quiet` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- approved PRD, frontend architecture and manifest SHA-256 values matched the
  active context lock; `docflow.py` is not installed under the Weak Harness
  policy
- no unit test was added for the CSS-only geometry change; the two-direction
  live DOM measurement is the regression verification
- Ponytail review removed four obsolete marker-specific transform rules and
  found no remaining complexity to cut: `Lean already. Ship.`

## Active filmstrip thumbnail border alignment

The filmstrip now aligns its flex items to the start instead of stretching each
slide button through the strip's remaining vertical space. The active
error-red border therefore hugs the thumbnail while the fixed strip height and
visible horizontal scrollbar remain unchanged.

In the reported Orca browser tab at 1291×805, the active button height changed
from 70px to 62.5px around its 58.5px canvas. The live DOM measured exactly 2px
between the canvas and the button on every side, matching the border itself.
`aria-current="page"` and the error-red border remained present. ArrowRight
moved the active state from slide 1 to slide 2 with the same 2px fit, and
ArrowLeft restored slide 1. The 623px filmstrip retained its 1732px scroll
width.

- `npm run supabase:start` — local stack already running
- `npm run supabase:reset` — clean migration replay passed
- `node --experimental-strip-types --test app/_model/class/presentation-rotation.test.ts` — 7/7 passed
- `npx tsc --noEmit` — passed
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning
- `git diff --check` — passed
- no unit test was added for the single CSS declaration; live DOM geometry,
  the accessibility snapshot and keyboard navigation are the regression
  verification
