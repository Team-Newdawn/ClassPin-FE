# Session folder rail accent verification

- Task: `session-folder-rail-accent`
- Requirements: `CLASS-DASH-002`, `CLASS-DASH-003`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Route: `/admin/session/c9163eb7-61c0-407d-b486-9fe29fb03519`

The live material rail derives its accent index from the same unfiltered `folders` order used by the dashboard. The supplied `assets/icons/file_list_icon.svg` is loaded as a static asset and used as a CSS mask, so its shape remains exact while its fill follows `--folder-accent`. The active material link uses translucent mixes of that same accent for its border and background.

Browser computed-style verification on the unfiled session confirmed:

- rail class: `session-folder-rail folder-accent-2`
- folder accent: `#3478f6`
- icon: `21×24px`, `rgb(52, 120, 246)`, mask URL ending in `file_list_icon...svg`
- active link background: 12% folder-accent mix
- active link border: 35% folder-accent mix
- folder rail navigation and current-page accessible names remained present

Verification commands:

- Orca browser selector wait and computed-style evaluation — passed
- Orca browser accessibility snapshot — passed
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- Ponytail review — no further in-scope simplification identified
- `git diff --check` — passed
