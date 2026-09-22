# Folder creation options evidence

## Scope

- Task: `folder-creation-options`
- Product requirement: `CLASS-DASH-002`
- Design source: Figma node `939:13729` plus the supplied screenshot
- Implementation mode: single

## Automated verification

- `node --test app/_model/class-folders.test.ts app/_model/stats.test.ts` — passed (4 tests).
- `npm run supabase:start` — passed after starting Docker Desktop.
- `npm run supabase:reset` — passed from a clean local database, including `20260910080000_add_class_folder_purpose.sql`.
- `npx supabase test db supabase/tests/class_folder_purpose.sql supabase/tests/class_folder_colors.sql` — passed (6 tests).
- `npm run lint` — passed.
- `npm run build` — passed with Next.js 16.3.3.
- `git diff --check` — passed.

## Remote schema recovery

- `npx supabase migration list --linked` showed only `20260910080000_add_class_folder_purpose.sql` missing from the linked project.
- `npx supabase db push --linked --dry-run` confirmed that the purpose migration was the only pending change; `npx supabase db push --linked --yes` then applied it.
- A read-only schema query confirmed the non-null text column, purpose check constraint, and zero invalid existing rows.
- An authenticated PostgREST `select=purpose&limit=0` smoke request returned HTTP 200 after the schema-cache reload.
- The focused model test, folder-purpose pgTAP test, ESLint, and `git diff --check` passed again after recovery.

The repository-wide `npx supabase test db` also ran the new tests successfully, but its aggregate result remains failed because the existing `supabase/tests/class_deletion.sql` emits no TAP plan. The focused affected database tests pass independently.

## Browser verification

The Orca child-workspace browser exercised a temporary demo-mode copy connected only to local state:

- The create dialog exposed an accessible name field, five named color radios, five named purpose radios, and defaulted to blue + Q&A.
- Selecting Education changed the live one-line description to `학습 자료와 교육 과정을 체계적으로 관리하는 폴더입니다.`.
- Creating `온보딩 교육 검증` with purple + Education stored `{ colorIndex: 3, purpose: "education" }` in demo localStorage.
- Reloading and filtering by folder name kept the folder visible with computed accent `rgb(124, 58, 237)`.
- Folder open, grid/list switch, Insights tab and scope dropdown, material open, folder rail collapse, question panel keyboard resize (`380` to `399` rendered pixels), speaker-note save, filmstrip `overflow-x: auto`, native vertical note resize, and ArrowLeft slide navigation were exercised.
- A separate local Supabase-mode launch redirected signed-out `/admin/dashboard` to `/login?next=%2Fadmin%2Fdashboard`, preserving the fail-closed guard.

## Ponytail review

Lean already. Native radios/fieldsets, existing CSS tokens, the existing SessionStore facade, and the existing Supabase service were reused; no dependency or speculative abstraction was added. The duplicate blue default literal was consolidated before the final verification rerun.
