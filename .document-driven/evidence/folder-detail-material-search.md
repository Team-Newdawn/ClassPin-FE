# Folder detail material search verification

- Task: `folder-detail-material-search`
- Requirement: `CLASS-DASH-003`
- Figma node: `Mw7TekAU6bxju63dFfJdQJ` / `620:456`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Route: `/admin/folders/65d9f60b-1760-4992-af3d-a5d7120be451`

The search input is rendered immediately before the header upload button. At the supplied 1063px viewport it computed to 401 × 66px, a 2px `rgb(164, 164, 164)` border, and an 8px radius. Its center line matched the 40px upload button, and the browser accessibility tree exposed it as a searchbox named `자료 제목 · 파일명 검색`.

Both the header and empty-state upload buttons computed to `rgb(0, 105, 240)` (`#0069F0`) with an 8px radius and used `/assets/icons/upload_icon.svg`. The empty-state button retained the accessible name `자료 업로드`.

Search behavior is covered by `lib/material-search.test.ts`: Unicode NFKC and case normalization, title and filename prefixes, multi-keyword AND matching, stable source order, blank queries, and no-match queries. The index is built only when the folder material array changes. Each keyword is stored in a character trie whose child edges are `Map` lookups and whose prefix nodes hold result sets, so input changes do not scan the full material array. Query cost is proportional to the query length and the smallest matching result set; returning results cannot be literal O(1).

A non-gating local measurement over 10,000 synthetic materials built the index in 25.182ms and resolved a one-result two-keyword query in 0.083ms. Exact timings vary by machine; the structural complexity and unit tests are the acceptance evidence.

Verification commands:

- `node --test lib/material-search.test.ts` — 3 tests passed
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed after the final simplification
- `npm run build` — passed after the final simplification, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- `git diff --check` — passed
- Orca browser snapshot/fill/computed-style checks — passed with no console errors

The broader login, folder, grid/list, Insights, material workspace, panel resize, note save, scrollbar, and keyboard navigation journey was already recorded in `.document-driven/evidence/folder-detail-upload-button-style.md`; this change does not touch those paths beyond moving the existing folder search control into the header.
