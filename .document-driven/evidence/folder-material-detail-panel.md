# Folder material detail panel evidence

## Scope

- Requirement: `CLASS-DASH-003`, approved by minchan_CTO on 2026-09-14.
- A material card selects in place instead of navigating immediately. The selected card exposes a semantic pressed state and the route renders a responsive detail panel with the existing material summary data.
- `슬라이드 열기` reuses the existing session route. `라이브 시작` synchronously reserves a new browser tab, reuses the existing owner-only `SessionStore.setStatus` mutation, and sends that tab to the existing `/admin/session/[id]/present` route only after a successful write. A blocked tab or failed write leaves the folder page in place with an accessible retryable error and no empty tab.
- Existing grid/list switching, search, move, delete, upload, and Insights behavior remain in place. No schema, service, API, or dependency was added.

## Verification

- Document state: regenerated `.document-driven/context-pack.json` from the active lock and passed `check-lock` plus `check-context-pack`.
- Local backend: `npm run supabase:start` reported the CLI Docker stack running; `npm run supabase:reset` replayed every migration through `20260910120000_add_lecture_presentation_autoplay.sql` from a clean database.
- Static checks: affected-file ESLint passed, `npm run lint` passed, `npm run build` passed with Next.js 16.3.3, and `git diff --check` passed.
- Desktop browser (demo data, 1440 CSS px): two material cards rendered; selecting one kept `/admin/folders/folder-1`, set `aria-pressed="true"`, retained focus, and rendered the 340px right panel beside the 805px material area. The panel exposed the first-slide preview, title, filename, LIVE/STOP state, counts, `슬라이드 열기`, and `라이브 시작`.
- Keyboard and view modes: native Enter selected the second card; switching grid to list retained the selected material and detail contents. The Insights tab rendered its accessible scope dropdown with folder and per-material options before returning to Materials.
- Responsive browser: at 900px, 600px, and a 720px CSS viewport representing 200% zoom on a 1440px display, the detail panel became one column and its top edge followed the material list bottom edge.
- Actions: `슬라이드 열기` navigated to `/admin/session/session-2`. From an ended session, `라이브 시작` left the folder page at `/admin/folders/folder-new-tab`, stored `status: "live"`, and opened `/admin/session/session-new-tab/present` as a second Pin Class tab. The new tab retained its opener, rendered the presentation shell and first-slide label, and showed a LIVE status dot. With `window.open` forced to return `null`, no tab opened, the second session stayed `ended`, and the folder detail rendered its retryable `role="alert"` error.
- Regression browser checks: `/` redirected a signed-out demo browser to `/login`; direct admin demo navigation rendered the dashboard and opened the seeded folder. In the material workspace, the folder rail collapsed, the keyboard separator widened the question panel from 380px to 399px, speaker notes saved on blur for two slides, the 10-slide filmstrip reported `clientWidth: 772`, `scrollWidth: 1152`, and `overflow-x: auto`, and a native ArrowRight moved slide 1 to slide 2 while focus was outside form controls.
- Accessibility: card selectors are native buttons with unique accessible names, `aria-pressed`, `aria-controls`, retained focus-visible behavior, and the live-start failure message remains an in-page `role="alert"`.
- Ponytail: final feature diff added no dependency or speculative abstraction and reused the existing card, route, store mutation, and service boundary. `ponytail-review` result: `Lean already. Ship.`
