# Folder detail upload button verification

- Task: `folder-detail-upload-button-style`
- Requirement: `CLASS-DASH-003`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Route: `/admin/folders/65d9f60b-1760-4992-af3d-a5d7120be451`

At a 1063px viewport width, the header upload button exposed the accessible name `자료 업로드` and computed to:

- background: `rgb(0, 105, 240)` (`#0069F0`)
- border radius: `8px`
- icon source: `/assets/icons/upload_icon.svg`
- icon intrinsic size: `34 × 24px`
- icon rendered size: `24 × 17px`
- decorative icon alt: empty, leaving the visible label as the accessible name

At 200% page zoom the button remained fully inside the viewport. Folder open, grid/list switch, Insights tab, folder rail collapse, material open, session rail collapse, question panel keyboard resize, speaker-note save and restore, filmstrip overflow, and document-level slide keyboard navigation were exercised. `/` redirected to `/login` while signed out.

Verification commands:

- `npm run supabase:start` — passed after starting Docker Desktop
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed
- `npm run build` — passed with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- `git diff --check` — passed
- `docflow validate`, `check-baseline`, `check-lock`, and `verify` — passed; this is a direct single-agent task, so no orchestration run file exists
