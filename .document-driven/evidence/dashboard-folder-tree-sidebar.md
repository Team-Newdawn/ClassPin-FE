# Dashboard folder tree sidebar verification

- Task: `dashboard-folder-tree-sidebar`
- Requirement: `CLASS-DASH-001`
- Route: `http://localhost:3000/admin/dashboard`
- Browser viewport: `1063 x 838`

## Browser checks

- Expanded layout measured `248px 815px`; the sidebar itself measured `248px`.
- The heading count was `2`, matching the two owner-folder links rendered from the existing store.
- Each tree item exposed the existing `/admin/folders/[id]` destination and an accessible `… 폴더 열기` name.
- The ClassPin logo and Project icon resolved from the requested `assets/logo/logo.svg` and `assets/icons/project_icon.svg` imports.
- The collapse control changed `aria-expanded` from `true` to `false`, changed its accessible name from `폴더 패널 접기` to `폴더 패널 열기`, and changed the layout to `72px 991px`.
- Both folder links remained keyboard-addressable in the collapsed navigation; visible initials replaced the hidden names.
- The control was returned to the expanded state after verification.

## Repository checks

- `npx tsc --noEmit --pretty false` passed.
- `npm run supabase:start && npm run supabase:reset` passed from a clean local database replay.
- `npm run lint` passed.
- `npm run build` passed. The existing Turbopack NFT warning for `next.config.ts` and `app/api/convert/route.ts` remains unrelated to this change.
