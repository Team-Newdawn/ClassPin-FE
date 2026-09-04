# Stable folder accent persistence verification

- Task: `stable-folder-accent-persistence`
- Requirements: `CLASS-DASH-002`, `CFA-010`, `CFA-020`, `CFA-042`,
  `CFA-056`, `CFA-060`, `CFA-062`, `CFA-080`, `CFA-081`
- Browser tab: `76d135b2-d10d-42ff-a43c-df43a2304319`

Each `ClassFolder` now owns a persisted `colorIndex`. The initial value still
cycles from the folder count, but dashboard and session consumers no longer
derive color from their current array position. Supabase mode stores
`session_folders.color_index`; demo mode and account failure caches serialize the
same DTO field. Legacy localStorage entries receive their prior index-derived
color once during normalization.

Persistence and performance properties:

- the forward-only migration backfills existing owner folders by
  `(created_at, id)` order with `0..5`, then adds a default, `NOT NULL`, and a
  `0..5` check constraint
- the existing owner RLS policy, grants, and composite owner foreign keys remain
  unchanged
- folder list and create operations include `color_index` in their existing
  select/insert, so no API request, RPC, index, trigger, or N+1 query was added
- Unfiled has no database row and therefore uses one stable constant accent

Verification evidence:

- model test first failed because the color helpers did not exist, then passed
  with two tests covering name validation, palette cycling, persisted values,
  and legacy fallback
- `npm run supabase:reset` replayed every migration from a clean local database
- `supabase test db supabase/tests/class_folder_colors.sql --local` passed three
  tests covering owner insertion, colors surviving an order change, and the
  database check constraint
- a pre-migration local database with eight existing folders was migrated in
  place; a Postgres assertion confirmed backfill `0,1,2,3,4,5,0,1`; the database
  was then returned to the latest clean state
- in demo mode the browser reversed the two persisted folder records and
  reloaded: the card order changed but each name retained `folder-accent-0` or
  `folder-accent-1`; the exact original localStorage value and display order were
  restored afterward
- Supabase local advisors returned only existing `multiple_permissive_policies`
  warnings on unrelated tables and no `session_folders` or new-column finding
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for
  `next.config.ts` / `app/api/convert/route.ts`
- Ponytail review removed one non-behavioral test assertion; final review:
  `Lean already. Ship.`

