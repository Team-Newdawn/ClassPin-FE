# Live question dialog and insight dropdown evidence

## Approved verification

- On `/admin/session/:id`, clicking a current-slide question card selects that question without opening a dialog, and only its matching slide PIN uses the selected blue state.
- Clicking the selected or unselected PIN opens the question detail dialog.
- The admin question detail dialog contains the answer field, resolve action, and submit action; the right question panel contains no answer composer.
- The public presentation dialog remains read-only and exposes no answer or resolve controls.
- On `/admin/folders/:id?tab=insights`, one labelled `select` contains the folder aggregate plus every material, changes the insight scope immediately, and remains keyboard-operable.
- The dropdown uses existing semantic design tokens and remains usable at 600px and 200% zoom.

## Commands and results

- `npm run supabase:start`: passed; the CLI-managed local stack was already running.
- `npm run supabase:reset`: passed; all migrations, including `20260904034311_enforce_public_lecture_slides.sql`, replayed from a clean database.
- `node --test app/_infrastructure/supabase/fetch-retry.test.ts app/_model/*.test.ts app/_model/class/*.test.ts`: 25/25 passed.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and route generation.
- Orca browser, demo-mode fixture:
  - Before selection: dialog `0`, selected PINs `[]`, right-panel textareas `0`.
  - After clicking question B's right-panel card: dialog `0`, selected PINs `["question-b"]`, selected cards `0`, right-panel textareas `0`.
  - After clicking question B's PIN: dialog `1`, one labelled answer textarea, resolve action present, submit action present, selected PINs `["question-b"]`.
  - Submitting `팝업에서 저장한 답변` updated the dialog and demo store, then cleared the draft.
  - The public presentation call site supplies no `answerControls`; the shared dialog therefore renders its read-only confirm branch. TypeScript build passed this boundary.
  - Insights exposed one labelled `인사이트 범위` combobox with `폴더 전체`, `React 상태 관리`, and `TypeScript 기초`; old chip buttons counted `0`.
  - Selecting `TypeScript 기초` changed the scope value to `session-b` and refreshed the aggregate from two questions to zero.
  - Native select focus/keyboard interaction was exercised; the CSS uses `width: min(360px, 100%)` and the existing `--focus`/semantic color tokens for narrow and zoomed layouts.
- Existing-flow browser smoke:
  - `/` redirected to `/login`; the demo dashboard, folder, grid/list switch, Insights tab, and material route opened successfully.
  - Folder rail collapse removed its navigation links; separator keyboard resize changed the question panel from `380px` to `359px` within its declared bounds.
  - Speaker note save persisted `브라우저 검증 메모`; ArrowRight moved the active slide from index `0` to `1`.
  - With a 12-slide fixture, the filmstrip measured `587px` client width and `1384px` scroll width with `overflow-x: auto`.
- `ponytail-review`: `Lean already. Ship.` No new dependency or speculative abstraction was introduced; stale inline-answer and selected-card CSS were removed.
