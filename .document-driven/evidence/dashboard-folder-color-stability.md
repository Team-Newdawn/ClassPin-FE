# Dashboard folder color stability verification

- Task: `dashboard-folder-color-stability`
- Requirement: `CLASS-DASH-002`
- Route: `http://localhost:3000/admin/dashboard`

## Browser check

Before filtering, the second folder rendered with:

- class: `folder-card folder-accent-1`
- accent: `#f59e0b`
- background: `rgb(245, 158, 11)`

After searching for that folder name so it became the only rendered card, it retained the same class, accent, and background values. Reloading restored the empty search and all three cards.

## Repository checks

- `npx tsc --noEmit --pretty false` passed.
- `npm run supabase:start && npm run supabase:reset` passed from a clean local database replay.
- `npm run lint` passed.
- `npm run build` passed. The existing Turbopack NFT warning for `next.config.ts` and `app/api/convert/route.ts` remains unrelated to this change.
