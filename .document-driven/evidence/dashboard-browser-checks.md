# Dashboard Figma restyle browser evidence

- Date: 2026-08-28
- Environment: `http://localhost:3000`, local demo data, Orca workspace browser (1063 × 838 viewport)
- Visual reference: `dashboard-after.jpg`

## Verified flows

- Entry route redirected from `/` to `/login` while signed out.
- Dashboard rendered the white rounded content surface, one-row search/upload/new-folder actions, five-column folder grid, layered cover sheets, and semantic folder color at desktop width.
- Folder search showed the no-results state and restored the card after clearing.
- New-folder dialog opened and closed with Escape without creating data.
- Folder detail opened; grid/list switching and the Insights tab both rendered.
- Material workspace opened from the folder detail.
- Folder rail collapsed and expanded.
- Question panel resized from 380 px to 429 px by dragging, then returned to 380 px.
- Speaker note saved a temporary verification value and was saved again as the original empty value.
- Filmstrip reported `scrollWidth: 1732`, `clientWidth: 579`, `overflow-x: auto`, and accepted `scrollLeft: 500` before restoration.
- Keyboard events moved the active slide from 3 to 4 with ArrowRight and back to 3 with ArrowLeft.

## Automated checks

- `npm run supabase:reset`: passed from a clean local database.
- `npm run lint`: passed.
- `npm run build`: passed with the existing Turbopack NFT tracing warning for `app/api/convert/route.ts`.

## Design feedback verification

- Folder actions render as a vertical three-dot disclosure instead of a trash button.
- Enter opens and closes the disclosure; Escape closes it and restores focus to its summary.
- The disclosure exposes `이름 수정` and `폴더 삭제` actions.
- The rename dialog opens with the existing folder name, saves a temporary changed name, and saves the original name again to restore browser data.
- A 833-hour-old folder renders as `34일 전 업데이트`.
- `node --test lib/class-folders.test.ts lib/i18n.test.ts` passed.
- `dashboard-folder-rename-rls.sql` updated one owner-visible folder as the authenticated owner and rolled the transaction back.
- The dashboard upload button exposes the accessible name `업로드` and loads `/assets/icons/upload_icon.svg` with an intrinsic 34 × 24 px size.
- The new-folder button keeps the accessible name `새 폴더` and loads `/assets/icons/folder_icon.svg` with an intrinsic 29 × 24 px size.
- At the 1063 px dashboard viewport, responsive sizing against the 1440 px design baseline rendered the upload icon at 24.6016 × 17.2266 px and the folder icon at 21.4062 × 17.5547 px. Their design-size caps remain 33.333 × 23.333 px and 29 × 23.78 px respectively; the small fractions reflect browser subpixel quantization.
