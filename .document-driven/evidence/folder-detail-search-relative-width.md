# Folder detail search relative-width verification

- Task: `folder-detail-search-relative-width`
- Requirement: `CLASS-DASH-003`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Route: `/admin/folders/65d9f60b-1760-4992-af3d-a5d7120be451`

The header action row uses one `--folder-detail-upload-width` value for both controls. At the supplied viewport, the upload button computed to 128px and the search input computed to 328px, an exact 200px difference. Their vertical center lines remained aligned. The search control may shrink below 328px only when the available row is narrower than the requested combined width, preventing overlap at narrow viewports.

Verification commands:

- Orca browser computed-geometry check — passed (`328 - 128 = 200`)
- Orca browser console check — no application errors
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed after the final simplification
- `npm run build` — passed after the final simplification, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- `git diff --check` — passed
