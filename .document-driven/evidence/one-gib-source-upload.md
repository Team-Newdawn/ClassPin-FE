# 1 GiB source upload evidence

- Task: `one-gib-source-upload`
- Requirements: `CLASS-UPLOAD-001`, `CFA-010`, `CFA-012`, `CFA-042`, `CFA-060`, `CFA-064`, `CFA-081`, `CFA-087`
- Date: 2026-09-04

## Implemented path

1. `useSlideUpload` delegates to the shared conversion service and keeps upload/processing UI state.
2. In Supabase mode the conversion service uploads the owner source to private `course-materials` with TUS 6 MiB chunks, retries, and stored resume metadata.
3. `/api/convert` authenticates the caller, verifies the first Storage path segment is the caller id, checks Storage metadata against the 1 GiB limit, and streams the private source to the conversion workspace.
4. Rendered slide images continue to stream to `lecture-slides`; uploaded local JPEGs are removed after Storage accepts them to bound temporary disk usage.
5. `persistSession` records the real `course-materials` source path so the existing material-deletion cleanup removes the original.

## Verification

- `npm run supabase:start` — passed.
- `npm run supabase:reset` — passed from a clean local database, including `20260904111614_increase_course_material_upload_limit.sql`.
- Local SQL check — `course-materials:1073741824`; `lecture-slides` remained `10485760`.
- Local authenticated integration — created a temporary admin, uploaded a 15,005-byte PDF through the TUS endpoint, invoked `/api/convert` with only the owner-scoped source path, received one slide plus the `done` NDJSON event, and removed the temporary source, slide, and user.
- Unauthenticated Supabase-mode `/api/convert` request — returned `401`.
- Orca embedded-browser demo upload — selected a PDF from the folder upload input, completed conversion, navigated to `/admin/session/{id}`, and rendered slide 1. Browser localStorage and generated fixture output were cleaned afterward.
- `node --experimental-strip-types --test app/_model/upload.test.ts app/_model/i18n.test.ts` — 3 tests passed.
- `npm run lint` — passed.
- `npm run build` — passed without warnings.
- `ponytail-review` — removed one unrelated Next dev-agent setting; the remaining upload diff is lean.

## Deployment prerequisite

The repository sets local Storage and the `course-materials` bucket to 1 GiB. Hosted Supabase must also have its global Storage file-size limit set to at least 1 GiB; Supabase requires a paid plan for a global limit above 50 MB. No production configuration or deployment was changed in this task.
