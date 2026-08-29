# Folder material thumbnail background verification

- Task: `folder-material-thumbnail-background`
- Requirements: `CLASS-DASH-003`, `CFA-032`, `CFA-037`
- Browser tab: `76d135b2-d10d-42ff-a43c-df43a2304319`
- Route: `/admin/folders/unfiled`

The route-owned grid card CSS now makes the thumbnail wrapper and its shared
canvas surface transparent. This removes both square backgrounds without
changing the shared `SlideCanvas` component or its other consumers.

Browser verification confirmed:

- before the change, the wrapper background was `rgb(241, 245, 249)` and the
  canvas background was `rgb(255, 255, 255)`
- after the change, both computed backgrounds were `rgba(0, 0, 0, 0)`
- the rounded image retained its `30.314px` radius, white border, shadow, and
  `cover` fit
- the top, right, bottom, and left thumbnail gaps remained exactly `5px`
- list view retained its existing backgrounds and `0px` padding
- the browser was returned to grid view after the regression check

Verification commands:

- Orca browser grid/list switching and computed-style evaluation — passed
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for
  `next.config.ts` / `app/api/convert/route.ts`
- local Supabase clean migration replay from the same implementation session was
  reused because no migration or data path changed
- Ponytail review — `Lean already. Ship.`

