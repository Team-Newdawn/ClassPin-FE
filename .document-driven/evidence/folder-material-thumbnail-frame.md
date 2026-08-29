# Folder material thumbnail frame verification

- Task: `folder-material-thumbnail-frame`
- Requirements: `CLASS-DASH-003`, `CFA-032`, `CFA-037`
- Browser tab: `76d135b2-d10d-42ff-a43c-df43a2304319`
- Route: `/admin/folders/unfiled`

The folder grid card applies the requested rounded image treatment in the
route-owned card CSS Module. The existing `<img src>` remains the image source,
with native `object-fit: cover` replacing a duplicated dynamic CSS background
URL. Semantic surface and neutral tokens supply the white border and light-gray
fallback.

Browser verification at the requested 1291px viewport confirmed:

- the image source and `alt="1번 슬라이드"` remained unchanged
- the image bounds remained `324.203px × 182.359px`
- the authored radius is `30.314px`, the border is `1.664px solid` white, and
  Chromium rendered the border at its device-pixel-snapped `1.5px` computed width
- computed background color was `rgb(209, 216, 224)` from `--pin-neutral-300`
- computed shadow was `rgba(0, 0, 0, 0.2) 0px 0px 3.979px 0px`
- computed `object-fit` was `cover`, and the thumbnail/canvas overflow allowed
  the image shadow to render
- list view retained its prior `0px` radius, no border/shadow, and `contain`
  image fit; the browser was returned to grid view afterward

Verification commands:

- Orca browser grid/list switching and computed-style evaluation — passed
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for
  `next.config.ts` / `app/api/convert/route.ts`
- local Supabase clean migration replay from the same implementation session was
  reused because no migration or data path changed
- Ponytail review — `Lean already. Ship.`
- document-driven `validate`, `check-baseline`, `check-lock`, and `verify` — passed;
  `check-run --audit` was not applicable because this direct single-agent task has
  no orchestration run file
- `git diff --check` — passed
