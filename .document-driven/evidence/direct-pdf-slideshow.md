# Direct PDF slideshow evidence

- Task: `direct-pdf-slideshow`
- Verified: 2026-09-07 (Asia/Seoul)
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
