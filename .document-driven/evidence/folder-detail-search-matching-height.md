# Folder detail search matching-height verification

- Task: `folder-detail-search-matching-height`
- Requirement: `CLASS-DASH-003`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Route: `/admin/folders/65d9f60b-1760-4992-af3d-a5d7120be451`

The folder-detail search control now uses the upload button's 40px height. At the supplied viewport, both controls computed to exactly 40px high with aligned top edges. The existing relative-width contract remained unchanged: the search control computed to 328px and the upload button to 128px, an exact 200px difference.

Verification commands:

- Orca browser computed-geometry check — passed (`40 - 40 = 0`; `328 - 128 = 200`)
- Orca browser console check — no application errors
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- Ponytail review — no further in-scope simplification identified
