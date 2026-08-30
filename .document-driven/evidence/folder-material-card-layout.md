# Folder material card layout verification

- Task: `folder-material-card-layout`
- Requirements: `CLASS-DASH-003`, `CFA-031`, `CFA-032`, `CFA-037`
- Browser tab: `76d135b2-d10d-42ff-a43c-df43a2304319`
- Route: `/admin/folders/unfiled`

The grid card keeps the reference hierarchy without copying its absolute coordinates
or container dimensions: thumbnail, title, file name, divider, then three equal
statistics columns with each number above its label. The existing card, icon, menu,
typography, and semantic color rules remain authoritative.

Implementation verification confirmed:

- reference-specific `419.35`, `456.67`, `401.66`, `246.3`, `1.66365`, and `3.9787` values are absent from the affected CSS Modules
- the folder grid uses responsive `auto-fill` columns and becomes one fluid column below 900px
- at a 1291px browser viewport the grid computed three `326px` columns
- the card computed `aspect-ratio: auto`, `1px` border, `16px` radius, and no resting shadow
- DOM bounds showed thumbnail, title, file name, divider, and statistics in the requested vertical order
- all three statistic labels rendered below their values in equal-width columns
- list view retained its existing `210px + fluid body` layout
- the material link retained its accessible name and the page retained semantic grid/list controls

Verification commands:

- reference-dimension static regression check — failed before the change and passed after it
- Orca browser grid/list switching, accessibility snapshots, and computed-layout evaluation — passed
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- local Supabase clean migration replay from the same implementation session was reused because no migration or data path changed
- Ponytail review — `Lean already. Ship.`
- `git diff --check` — passed
