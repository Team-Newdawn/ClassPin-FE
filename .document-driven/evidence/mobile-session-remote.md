# Mobile session remote evidence

## Scope

- Requirements: `CLASS-DASH-004`, `CLASS-LIVE-003`, `CLASS-LIVE-004`, `CLASS-LIVE-006`, `CFA-010`, `CFA-011`, `CFA-012`, `CFA-031`, `CFA-032`, `CFA-081`, `CFA-082`, `CFA-083`, `CFA-087`, `CFA-088`.
- At 600px and below, the instructor session route presents a focused mobile remote with the current slide, existing previous/page/next navigation, `PIN LIVE`, slide auto-advance, and existing QR placement controls. Desktop-only folder, tab, toolbar, filmstrip, notes, and question-panel surfaces are hidden without changing their desktop behavior.
- Mobile navigation and switches reuse the existing controller and SessionStore persistence paths. No new data source, service, migration, or dependency is introduced.
- Dashboard folder cards preserve their current information, behavior, and responsive grid while restoring the pre-Figma front: one existing 140deg accent/surface `color-mix` gradient clipped by the original polygon.

## Commands and results

- `npm run supabase:start`: passed; the CLI-managed Docker stack was already running.
- `npm run supabase:reset`: passed from a clean local database through `20260910120000_add_lecture_presentation_autoplay.sql`.
- `node --test app/_model/class/presentation-rotation.test.ts app/_model/class-folders.test.ts`: 14/14 passed; the only output outside the assertions was Node's existing module-type warning.
- Affected-file ESLint, `npm run lint`, `npm run build`, and `git diff --check`: passed. The production build completed with Next.js 16.3.3, TypeScript checking, page-data collection, and route generation.
- Document-driven `validate`, `check-baseline`, `check-lock`, `check-context-pack`, and final `verify`: passed with complete traceability for `mobile-session-remote`. `check-run --audit` is not applicable to this direct single-agent change because no orchestration run file exists.
- `ponytail-review`: removed the Figma-specific custom color and pseudo-element completely. The restored front uses only the original native CSS gradient and `clip-path`, with no runtime asset, component wrapper, or dependency. No other safe in-scope simplification remained.

## Browser verification

- Dashboard retained the existing responsive card grid, preview, title, statistics, timestamp, accessible folder link, and menu. At the reported 1071px viewport width, browser-computed styles confirmed the original single 140deg `color-mix` gradient and `polygon(0 0, 55% 0, 64% 14%, 100% 14%, 100% 100%, 0 100%)`; both pseudo-elements had no generated content.
- Browser readback confirmed no inline accent override remained and the persisted purple, red, and blue card backgrounds were unchanged.
- Mobile instructor workspace at 390x844 exposed the current slide, one previous/page/next navigation group, `PIN LIVE` and auto-advance switches, and a native QR placement select with hidden plus all four corners. The folder rail, tabs, stage toolbar, filmstrip, speaker notes, and question panel were absent from the accessibility tree.
- The slide measured 358x201.375 CSS pixels. Previous/next buttons were 129x48, the page-number control was 84x44, both switches were 74x44, and the QR select was 140x44, meeting the 44px target requirement.
- Opening the mobile route with `?tab=questions` still selected the live remote. Native keyboard activation moved the deck from slide 3 to slide 2; PIN and auto-advance each changed their accessible checked state and were restored to PIN ON and auto-advance OFF.
- Changing QR from hidden to bottom-left updated the already-open presentation tab through the existing demo `BroadcastChannel`; the presentation shell gained `qr-bottom-left` and rendered the bottom-left QR. Restoring hidden removed both the QR and placement class.
- Breakpoint checks showed the mobile header at 600px and the unchanged desktop rail, tabs, toolbar, filmstrip, notes, and question panel at 601px. At 300x419, the workspace had no horizontal overflow, retained vertical scrolling, and kept the QR control at 140x44.
- At 1440px, all desktop-only session surfaces were restored with no horizontal overflow. Existing shared `:focus-visible` and reduced-motion rules remain unchanged; the accessibility snapshot confirmed native semantic switches, spinbutton, buttons, and combobox, while the automation client's trusted Tab sequence was not reliable enough to claim a visual focus-ring measurement.
- The broader unchanged-flow regression gate was exercised in the same worktree and is recorded in `folder-material-detail-panel.md`: signed-out entry redirect, folder open, grid/list switch, Insights scope, material open, rail collapse, panel keyboard resize, note persistence, horizontal filmstrip overflow, and keyboard slide navigation all passed.

## Design and boundary notes

- The Figma `620:141` experiment has been fully removed from the folder front. The component is back to its original `color-mix` gradient and polygon `clip-path`; it has no SVG, pseudo-element, or new DOM for the face.
- The persisted color setting path remains `colorIndex -> FolderCard accent class`; no model, controller, store, service, or migration changed. The original token map was retained exactly: safety, mobility, facility, convenience, idea, and clean. Browser-computed values confirmed the saved purple `#8b5cf6`, red `#e5484d`, and default blue `#3478f6` backgrounds.
- The mobile controls call the existing session controller and `SessionStore` mutations. No participant payload, RLS rule, migration, service, API, or dependency changed for this task.
