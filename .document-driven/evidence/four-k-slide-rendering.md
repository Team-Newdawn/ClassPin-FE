# 4K slide rendering evidence

- Task: `four-k-slide-rendering`
- Requirements: `CLASS-UPLOAD-002`, `CFA-010`, `CFA-013`, `CFA-014`, `CFA-057`, `CFA-074`, `CFA-081`, `CFA-087`
- Date: 2026-09-04

## Root cause and implementation

- `SlideCanvas` already renders the supplied image directly with native `img` sizing and `object-fit: contain`; it does not downsample or recompress the slide.
- `/api/convert` capped generated JPEGs at a 1600px long edge and quality 86, so large presentation surfaces magnified an already-low-resolution source.
- The existing `pdftoppm` conversion path now defaults to a 3840px long edge and JPEG quality 100. The existing `SLIDE_MAX_EDGE` override remains intact.
- No dependency, service, migration, CSS, or environment variable was added.

## Verification

- Direct baseline render: first page was `1132x1600`, 161,894 bytes.
- Direct post-change render with the production arguments: first page was `2715x3840`, 1,289,156 bytes; the 11-page sample completed in 1.40 seconds on the local machine.
- Local `/api/convert` integration converted all 11 pages of `output/pdf/pin_class_data_flow.pdf`; every generated image had a long edge of exactly 3840px.
- Existing production slideshow browser check displayed `1 / 25`, exposed accessible previous/next controls, moved to another slide by keyboard, and returned to slide 1.
- `npm run supabase:start` passed.
- Clean `npm run supabase:reset` passed, including both current migrations.
- All 26 Node tests passed with `node --test`.
- `supabase/tests/public_lecture_slides.sql` passed. The aggregate SQL test command still exits 1 because the unrelated existing `class_deletion.sql` emits no TAP plan; no SQL assertion failed.
- `npm run lint` passed.
- `npm run build` passed.
- `ponytail-review`: Lean already. Ship. The implementation is two default-value changes on the existing conversion path.

## Deployment

- Cloud Build `82618808-310d-4268-a60b-1d5641964fec` completed successfully with image tag `6e31c42`.
- Cloud Run revision `pin-class-00099-4j2` is ready and serves 100% of traffic in `asia-northeast1`.
- Both the custom-domain and direct Cloud Run public presentation URLs returned HTTP 200 with no login redirect or cookies (`1.17s` and `1.75s` respectively).
