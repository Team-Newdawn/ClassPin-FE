# Live slide number navigation evidence

## Scope

- Requirements: `CLASS-LIVE-003`, `CLASS-LIVE-004`, `CFA-010`, `CFA-020`, `CFA-032`, `CFA-080`, `CFA-081`, `CFA-082`, `CFA-083`, `CFA-087`, `CFA-088`.
- The live stage renders labelled previous/next buttons around a native number input showing `current / total`; the former stage bullet row is removed. Focusing or clicking the input selects the current number, but editing it—including clearing it completely—does not navigate.
- The native uncontrolled input keeps the editable draft locally and remounts for a changed slide ID. The controller validates its DOM value only on Enter with a tested pure model helper. A valid in-range integer reuses the existing `changeSlide` -> `SessionStore.setCurrentSlide` path. Empty, fractional, non-numeric, and out-of-range values never navigate and reset to the current page on Enter, Escape, or blur. Filmstrip navigation, optimistic current-page persistence, Realtime synchronization, live rotation, and participant boundaries are unchanged.

## Commands and results

- `npm run supabase:start`: passed; the CLI-managed local stack was already running.
- `npm run supabase:reset`: passed; every migration replayed from a clean local database through `20260910080000_add_class_folder_purpose.sql`.
- `node --test app/_model/class/presentation-rotation.test.ts`: 10/10 passed, including valid, empty, out-of-range, fractional, and non-numeric page-number strings.
- `npm run lint`: passed.
- `npm run build`: passed in the current worktree, including Turbopack compilation, TypeScript, page-data collection, and route generation.
- Post-review `git diff --check`, targeted Node test, and targeted ESLint: passed.
- `ponytail-review`: the first passing implementation's keyed controller state was replaced with the native uncontrolled number input plus its slide-ID React key; no extra state, abstraction, dependency, or duplicate navigation path remains. Final result: `Lean already. Ship.`

## Browser verification

- Orca browser on the supplied `/admin/session/2a028aa0-1414-44be-afc5-da53d2946736` route at 1291px viewport width:
  - The accessibility tree exposes one `슬라이드 탐색` navigation landmark, `이전 슬라이드` and `다음 슬라이드` buttons, and a labelled `이동할 슬라이드 번호 (총 21장)` spinbutton.
  - The old `.slide-dots` element count is `0`.
  - All three controls are exactly 30% smaller: previous/next render at 75.59375x36.3984375 CSS pixels from 108x52, and the centered page picker renders at 94.5x32.7578125 from 135x46.8 after browser subpixel rounding. The navigation grid row similarly changed from 72px to 50.3984px.
  - Each control and the stage reported no horizontal or vertical overflow with the 21-slide count.
  - `다음` moved slide 1 to 2 and `이전` returned it to slide 1.
  - From slide 10, entering `15` left the canvas and note heading on slide 10; pressing Enter then moved both to slide 15 while retaining input focus.
  - Clearing the input completely left slide 15 visible. Enter restored the input to `15` without moving.
  - Entering the out-of-range value `22` left slide 15 visible; Enter restored the input to `15` without moving. The pure helper separately covers fractional and non-numeric values.
  - Entering another valid draft and pressing Escape restored `15` without moving; entering a valid draft and moving focus to the QR placement select did the same on blur.
  - While the number input remained focused, ArrowLeft preserved slide 2 and the input focus. The visible focus ring computed to the shared blue focus token.
  - At the required 400px stage floor, the 94.5px picker and both buttons fit inside the 352px content row with no child or navigation overflow.
  - The new controls contain no transition or animation, so reduced-motion behavior is unchanged.
  - No runtime error appeared after the final Fast Refresh; the earlier console history retained one transient controlled-input warning from the intermediate edit before its `onChange` handler was applied.
- Existing unchanged-flow evidence remains in `.document-driven/evidence/live-question-dialog-insight-dropdown.md`: login redirect, folder open, grid/list, Insights, material open, folder rail collapse, panel keyboard resize, note save, filmstrip overflow, and document-level keyboard slide navigation were already exercised on this workspace path. This change preserves those DOM and controller paths except for the replaced stage navigation row.
