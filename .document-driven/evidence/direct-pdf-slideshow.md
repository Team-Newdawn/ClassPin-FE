# Direct PDF slideshow evidence

- Task: `direct-pdf-slideshow`
- Verified: 2026-09-08 (Asia/Seoul)
- Context lock: `5f6e1a1b2c5639e0f76f231c5237379ea0f46900c7eed471d4573a31dbf470f5`
- Implementation mode: direct single-agent change; no orchestration run exists.

## Implemented path

- Authenticated PDF upload uses the existing 6 MiB resumable `course-materials` upload and reads the page count through PDF.js in the browser. It does not call `/api/convert` and does not create `lecture-slides` JPEG objects.
- `slides.source_page_index` references an original PDF page. The database constraint requires exactly one of `image_path` and `source_page_index`, preserving legacy rendered images and appended image slides.
- `SlideCanvas` renders PDF pages through a shared, dynamically loaded PDF.js document. Intersection and resize observers limit work to visible/nearby pages and the render task is cancelled before the same canvas is reused.
- Owner reads batch PDF URL signing into one Storage request regardless of the number of PDF materials. The participant session path performs one lecture graph read, one PDF signing request, and one question RPC (three snapshot requests). A single Realtime channel binds lecture, slide, and question changes.
- Storage RLS permits participant PDF reads only for a live PDF lecture. A signed URL is bounded to 12 hours; after the lecture ends RLS refuses new signing. Participant DTOs and the PDF access path omit `speakerNote`.
- Demo mode copies the source as `public/generated/<id>/source.pdf` and returns PDF page mappings; it does not render JPEGs. PPT/PPTX keeps the existing LibreOffice/pdftoppm conversion path.

## Browser verification

Orca's embedded browser ran the app at `http://127.0.0.1:3100` in demo mode with `output/pdf/pin_class_data_flow.pdf` (11 pages).

- Upload API result: 11 slides, first slide `sourcePageIndex = 0`, `pdfUrl = /generated/<id>/source.pdf`, and zero slides with `imageUrl`.
- Admin material workspace: main canvas and visible filmstrip canvases reached `data-ready=true`. Moving to slide 3 produced a ready `3번 슬라이드` canvas with an 866 × 612 render surface.
- Filmstrip: computed `overflow-x: auto`, `scrollWidth = 1268`, `clientWidth = 587`.
- Keyboard handler: an `ArrowRight` `KeyboardEvent` in the live page moved the active filmstrip item from slide 2 to slide 3. The page automation driver's native key command did not reach the DOM, so the same browser page dispatched the event directly.
- Folder rail: the accessible control changed from `폴더 패널 접기` to `폴더 패널 열기` after collapse.
- Question panel: the separator's `aria-valuenow` changed from 380 to 399 after ArrowLeft resize handling.
- Speaker note: `PDF direct-render verification` saved on slide 3 and the save button returned to disabled.
- Presentation route: one ready PDF canvas, zero generated slide `<img>` elements.
- Participant route: one ready PDF canvas, zero generated slide `<img>` elements, and the saved speaker-note text was absent.
- Regression journey: `/` redirected to `/login`; `/admin/dashboard` opened the fixture folder; grid/list toggled with `aria-pressed`; the Insights tab exposed the aggregate/material scope dropdown; the material route opened successfully.
- Demo localStorage/BroadcastChannel synchronized the direct-PDF session across admin, presentation, and participant tabs. The test session and its generated PDF copy were removed after verification; the pre-existing fixture was preserved.

## Database and security verification

- `npm run supabase:start` — passed; the CLI-managed local stack was already running.
- `npm run supabase:reset` — passed from a clean database and replayed `20260907190000_direct_pdf_slides.sql`.
- `npx supabase test db supabase/tests/direct_pdf_slides.sql` — 7/7 passed:
  - nullable image path for direct PDF slides;
  - original page mapping retained;
  - image/PDF dual source rejected;
  - deleting a PDF page returns no image cleanup path and retains the remaining original-page mapping;
  - participant can select the live PDF object;
  - participant cannot select it after the lecture ends.

## Code checks

- `node --test --experimental-strip-types app/_model/upload.test.ts` — 2/2 passed.
- `rg --files app -g '*.test.ts' | sort | xargs node --test --experimental-strip-types` — 29/29 passed.
- `npx tsc --noEmit --pretty false` — passed.
- `npm run lint` — passed.
- `npm run build` — passed with Next.js 16.3.3/Turbopack; all application routes were generated.
- `git diff --check` — passed after final trace generation.
- `ponytail-review` — `Lean already. Ship.` No safe in-scope deletion was identified; PDF.js is the only new runtime dependency and is required for page-level rendering beneath PIN overlays.
- Document graph: `validate`, `check-baseline`, `check-lock`, and `verify` passed. `check-run --audit` reported the absent `run.json`; this is expected and not a gate for the selected direct single-agent mode.

## Production recovery

- The remote schema initially lacked `slides.source_page_index`; migrations `20260904111614` and `20260907190000` were applied and verified against the linked Supabase project.
- Two failed uploads in the `뉴던` folder had material versions with zero slides. Their two course graphs and matching `course-materials` source PDFs were removed after rechecking the exact targets; no zero-slide material versions remain.
- `FolderMaterialCard` now skips `SlideCanvas` when a corrupt or incomplete session has no first slide, preventing one bad record from crashing the folder route.
- `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` passed. Cloud Run revision `pin-class-00104-rsf` serves 100% of traffic, and the production folder route returns HTTP 200.

## Many-slide layout recovery

- The first 30-slide fixture did not reproduce the intrinsic sizing failure. The follow-up screenshot and a matching 121-slide fixture showed that the unbounded slide-dot row widened the `player-stage` CSS Grid's implicit column, not just the filmstrip.
- Before the root fix, a 589px-wide stage computed a 1670px implicit column and 1718px scroll width, placing the centered slide outside the visible stage.
- `player-stage` now declares `grid-template-columns: minmax(0, 1fr)`, constraining every stage row to the available width while the dots and filmstrip keep their own horizontal overflow behavior.
- After the fix, the same fixture computed a 541px stage column and `589 / 589px` stage client/scroll width. The canvas stayed within the stage and the filmstrip remained scrollable at `541 / 14028px`.
- With the question panel resized to 399px, selecting slide 121 and dispatching `ArrowLeft` moved to slide 120; the stage remained `570 / 570px` and the filmstrip remained `522 / 14028px` with the canvas contained.
- A clean `npm run supabase:reset`, all 29 Node tests, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` passed.
- `ponytail-review` returned `Lean already. Ship.`; the final layout fix is one native CSS Grid declaration with no new dependency or abstraction.
- Cloud Run revision `pin-class-00106-5mv` serves 100% of traffic; the production root redirects to `/login` and that route returns HTTP 200.

## PDF viewer startup latency

- The visible slide number is the existing placeholder while PDF.js loads the source, resolves the page, and paints its canvas. The stored and served source remains the original PDF; no JPEG slide conversion was reintroduced.
- A non-compact/current slide now begins eagerly. Compact folder-rail and filmstrip pages retain intersection-based loading and wait while that current slide is rendering, preventing several canvases from competing with the main stage on a cold open.
- Completed page renders keep a bounded in-memory preview (maximum 24 pages, 320px wide). Opening a material after its folder-card preview has rendered, or revisiting a rendered slide, restores that preview before the full-resolution canvas replaces it.
- In the embedded browser, an uncached 3.9 MiB, 11-page PDF spent about 2.0 seconds in first-page parsing/rendering even though the local transfer completed in about 30ms. Resolution-only experiments did not improve that parse-bound case and were removed.
- In the normal folder-card-to-material journey, the cached preview made the main canvas ready with the client navigation in 110ms. Its 309px preview canvas was then replaced by the 428px full-resolution render without returning to the numbered placeholder. In the final-code recheck, returning to an already rendered slide restored its 320px preview in 4ms before the full render replaced it.
- `ponytail-review` removed the speculative multi-main-viewer reference count and LRU touch operations (`net: -17 lines`). The final review found no further safe deletion without removing the bounded preview cache or main-stage priority behavior.
- A clean `npm run supabase:reset`, the 7 direct-PDF database tests, all 29 Node tests, `npx tsc --noEmit`, `npm run lint`, `npm run build`, and `git diff --check` passed. The final embedded-browser pass also verified folder-card navigation, cached slide return, panel/layout controls, presentation rendering, and participant note isolation.
- Cloud Run revision `pin-class-00107-rj6` serves 100% of traffic. The production root returns HTTP 307 to `/login`, and `/login` returns HTTP 200.

## Filmstrip PIN count recovery (2026-09-08)

- Feedback: PDF filmstrip thumbnails hid the top-right question count. The count was still rendered from `questionsBySlide`; the PDF canvas at `z-index: 1` painted over the badge and page number at `auto`.
- Added one `z-index: 2` declaration to the existing page-owned filmstrip overlay rule (`CLASS-UPLOAD-003`, `CFA-032`, `CFA-082`). Existing count semantics, zero-count omission, colors and placement are preserved.
- Production read-only inspection confirmed the first thumbnail contained a count of 1 but hit-testing its center returned CANVAS.
- Local embedded-browser demo fixture at 1071×838: loaded PDF thumbnail hit-testing returned I for the count and SPAN for the page number. Temporarily setting their inline z-index to auto reproduced CANVAS for both; removing those overrides restored both overlays. The zero-question PDF slide had no badge.
- Browser regression checks passed: root redirected to login, dashboard folder opened, grid/list toggled, Insights exposed the scope dropdown, material opened, folder rail collapsed, question-panel keyboard resize changed 380 to 399, note saved, and ArrowRight changed the active slide from 1 to 2. Filmstrip client/scroll widths were 553/1732px.
- `npm run supabase:start`, clean `npm run supabase:reset`, `npm run lint`, `npm run build`, and `git diff --check` passed. No new pure logic or dependency was added.
- `ponytail-review`: Lean already. Ship. The implementation is one CSS declaration; pre-existing working-tree edits were preserved.
- `verify-document-driven-change`: manifest and both locked full-document SHA-256 hashes matched; existing CFA-082 trace maps the changed stylesheet to this evidence. The repository has no `.document-driven/bin/docflow.py`; the repository instructions waive generated harness installation, so document/trace checks were performed directly. No deployment was performed for this correction.
