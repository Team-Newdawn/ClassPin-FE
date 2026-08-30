# Shared admin search component verification

- Task: `shared-admin-search-component`
- Requirements: `CLASS-DASH-002`, `CLASS-DASH-003`
- Figma: file `Mw7TekAU6bxju63dFfJdQJ`, node `620:53`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Routes: `/admin/dashboard`, `/admin/folders/unfiled`

Both routes render the same `AdminSearch` component and exact exported Figma search icon. Browser computed-style comparison confirmed that every checked design property matches: 2px solid `rgb(164, 164, 164)` border, 8px radius, transparent background, 28px horizontal padding, 23px gap, 27px icon, Pretendard-adapted 22px/500 input typography, and `rgb(164, 164, 164)` placeholder color. Only the explicitly excluded dimensions differ (`260×44` on the folder dashboard and `328×40` on the material page), along with the placeholders `폴더 검색` and `자료 제목 파일명 검색`.

Verification commands:

- Figma `get_design_context` — node `620:53` read before implementation
- Orca browser computed-style comparison — passed on both routes
- Orca browser folder search smoke — entered a non-matching query and observed `검색 결과가 없어요`
- Orca browser material search smoke — entered a non-matching query and observed `조건에 맞는 자료가 없어요`
- Orca browser accessibility snapshot — both inputs exposed with the expected `searchbox` names
- Orca browser console check — no application errors; development-only Fast Refresh messages remained
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- Ponytail review — no further in-scope simplification identified
- `git diff --check` — passed
