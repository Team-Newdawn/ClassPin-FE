# Admin search border-color verification

- Task: `admin-search-border-color`
- Requirements: `CLASS-DASH-002`, `CLASS-DASH-003`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Routes: `/admin/dashboard`, `/admin/folders/unfiled`

The dashboard folder search now consumes the existing `--color-folder-search-border` semantic token. Its computed border color changed from `rgb(209, 216, 224)` to `rgb(164, 164, 164)` while retaining its existing 1px width. The folder-detail material search already consumed the same token and remained `rgb(164, 164, 164)` with its existing 2px width.

Verification commands:

- Orca browser pre-change computed-style check — dashboard reproduced `rgb(209, 216, 224)`
- Orca browser post-change computed-style check — dashboard and folder detail both passed at `rgb(164, 164, 164)`
- Orca browser console check — no application errors
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- Ponytail review — no further in-scope simplification identified
- `git diff --check` — passed
