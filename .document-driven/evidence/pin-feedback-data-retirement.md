# Pin Feedback data retirement evidence

- Task: `pin-feedback-data-retirement`
- Approval: `minchan_CTO`, 2026-09-01T06:50:03Z
- Approved artifact SHA-256: `0edec27f023a0bc0ac8ad9e1567b089372781f3a6b6b93391a51aa35ce4a3e83`
- Remote service retirement completed: 2026-09-01T07:21:51Z
- Result: remote Pin Feedback DB, Data API, Realtime, Storage, and dynamically eligible Auth identities retired; Pin Class preservation checks passed.

## Private backup

- An AES-256 encrypted APFS sparsebundle outside the repository contains the logical DB export, private actor manifests, all 120 `campaign-images` objects, and the 36 preserved imported `lecture-slides` objects.
- The logical export restored successfully into an isolated clean PostgreSQL database. Restored source counts and canonical row fingerprints matched the remote source.
- All copied Storage bytes matched source size and MD5 and locally computed SHA-256.
- Backup created: 2026-09-01T02:27:21Z; verified: 2026-09-01T02:42:30Z.
- Retention starts: 2026-09-01T07:21:51Z; expires: 2026-10-01T07:21:51Z.
- Final backup manifest SHA-256: `d756441c18c4bcc5d0a7662b08997f29879134ab9bd716a0d754d42f632d5b3a`.
- The passphrase remains separate in macOS Keychain. No credential, actor UUID, object path, or response body is stored in repository evidence.

## Sealed source baseline

| Entity | Rows | Canonical SHA-256 |
| --- | ---: | --- |
| `campaigns` | 24 | `264158445f460d2a711279f03899214f56b1502a878b059289dbcdf05cb7b43d` |
| `campaign_pages` | 54 | `2e6d7b6c59d9ef68a29a16ffdb13a717f7e3297832635ae07a3dd66ad934e5b8` |
| `feedback_pins` | 1,001 | `9ebd2627927ded8f3ee32951574c9dee6220406d8a9a002e54863b418f8c8e56` |
| `feedback_pin_reactions` | 93 | `81539463cff9067884fee198bf79bc2def6ce491178fdab4ab7f208f318314a3` |
| Campaign survey rows | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

- `campaign-images`: 120 objects, 44,720,115 bytes, normalized name/ETag/size inventory SHA-256 `ee33fc80adc98bee202b0d4cda74c965a67cfcce05e3be667f067a619ba0c3e0`.
- The source counts and hashes were recomputed immediately before deletion and matched the sealed backup exactly.

## Remote execution and postconditions

- Supabase CLI Storage root recursion removed exactly the 120 source objects and, as an observed CLI behavior, deleted the now-empty bucket metadata in the same official Storage API operation. No `storage.objects` or `storage.buckets` row was deleted directly with SQL.
- Post-operation SQL and Storage API checks reported zero source objects and no `campaign-images` bucket. The Storage SDK returned `StorageApiError`/404 for bucket lookup.
- Three earlier migration versions already exactly reflected in the remote schema but missing from migration history were repaired as `applied`. The pending point-anchor restriction and `20260901024503_retire_pin_feedback_data.sql` were then applied through `supabase db push`.
- Postflight reported zero legacy relations, enum types, functions, Realtime publication members, and Campaign Storage policies. The old survey RPC is absent, the lecture-only RPC is present, `campaign_id` is absent, and `lecture_id` is required.
- Data API checks returned HTTP 404 for the retired Campaign table and retired generic survey RPC.
- Source bucket removal happened before the SQL transaction because the pinned CLI combined root object and bucket deletion. The transaction still independently rechecked the zero-object precondition and all DB fingerprints before committing; the verified backup remained mounted and recoverable during the operation.

## Pin Class preservation

The complete pre-operation Class table fingerprints were recomputed after migration and matched exactly:

| Entity | Rows | Canonical SHA-256 |
| --- | ---: | --- |
| `answers` | 8 | `2ea12374bd8ce210f9f4dc663e4106d269848d86b9e647e2334b48a7080125b6` |
| `course_brain_memory` | 944 | `2e18fc2cfdb13e34f9058ab9d719f90a91bb3eeb0f90252f6ff7202d98c072af` |
| `courses` | 50 | `e0ca84613ce1590f683de35089774bb14d45107177265fd0381b836895c87c72` |
| `lectures` | 45 | `1ce33b19d46cdbae68afc631fef6191bfe9e677c51aca9d0c811ed991be3dc51` |
| `material_versions` | 45 | `9ecde12cd2438482ca727962da8a168c198bb93477c720d387e1b344b23357af` |
| `materials` | 45 | `b5109a647b6c2e09a7315f0b82e39af983fbd515a96f36caaa04fb9bcd95f4a4` |
| `platform_experience_responses` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `question_reactions` | 28 | `16c001650b5fdd07d851c106029e8eadd66e1c0a8eb2390acb701646cd1cb15b` |
| `questions` | 936 | `92ecfa51d9004ca920394456ce2bd1200c6b5d02a0dd03e57bdd5806c0f57271` |
| `region_anchors` | 936 | `470944ed319f1d894ba9184e62e23bb38ff9db8640b50001afe62d194b89cb7f` |
| `session_folders` | 3 | `8708f25bb078f00835336fa20bcfd0a127021f2cf681db1c64aa2ca77528217b` |
| `slide_instructor_notes` | 2 | `d440c25b72e2f75d21607172345f87bb97fb29e19d7ffc782afd48a6cefa03ae` |
| `slides` | 425 | `a9a8372825dbf9b8463c4a3af2db0f6a7da1422271e16b697f62d0c931c51be5` |

- The `source_path LIKE 'pin-feedback/%'` graph remained 17 courses, 17 lectures, 17 materials, 17 versions, 36 slides, 906 questions, 906 anchors, 1 answer, 28 reactions, and 907 memory rows; its row fingerprints also matched before and after.
- All 36 referenced `lecture-slides` objects were downloaded after migration and rechecked byte-for-byte: 15,780,426 bytes, zero size/MD5/SHA-256 mismatches.

## Auth retirement

- Sealed source actors: 200.
- Latest protected Class/owner/admin set: 189. Three source actors also appeared as top-level owners in non-retired Storage; these were already in the protected set.
- Dynamically eligible anonymous legacy-only candidates: 11, exactly matching the sealed private candidate manifest.
- Supabase Auth Admin hard-delete: 11 succeeded, 0 failed; 11 were confirmed absent by Admin API. A second dynamic calculation found 11 already absent and zero remaining eligible candidates.
- Hard deletion cascaded Auth sessions and invalidated refresh tokens. Existing access JWTs remain stateless until their configured maximum lifetime; repository config is 3,600 seconds. No legacy token was retained in evidence. Deleted profiles also make participant RLS checks fail for those subjects immediately.

## Verification

- `npm run supabase:reset` — passed from a clean local database.
- `supabase test db --local supabase/tests/pin_feedback_retirement.sql` — passed, 1 TAP assertion.
- Folder-color and participant point-anchor DB tests — passed, 6 TAP assertions.
- Existing `class_deletion.sql` direct assertions — passed. A full directory TAP invocation remains unsuitable because that pre-existing file has no TAP plan; this is not caused by the retirement change.
- Rollback probes — a non-empty source bucket and an unexpected source fingerprint each aborted the migration and rolled back schema/policy/history changes.
- `npm run lint` — passed.
- `npm run build` — passed. The existing unrelated dynamic-filesystem Turbopack warning remains in `app/api/convert/route.ts`.
- Browser — passed signed-in entry redirect, folder opening, grid/list, Insights aggregate/material scopes, imported material opening, folder-rail collapse, question-panel keyboard resize, note save/restore, filmstrip scrollbar, ArrowLeft/ArrowRight navigation, `/join/[code]/final` render, and successful lecture-only survey submission. The single remote test survey row and its anonymous test user were then removed; zero references remained.
- Supabase advisors — security warnings reduced from 19 to 16 and performance warnings from 12 to 9; no post-operation finding references Campaign or Feedback Pin contracts. Remaining warnings belong to the active Pin Class/Auth configuration.
- `ponytail-review` — `Lean already. Ship.` No safe lines could be removed without weakening the approved loss-prevention or contract assertions.

## Traceability

| Requirements | Implementation/evidence |
| --- | --- |
| PFDR-001~005, 020~026, 050~055 | `supabase/migrations/20260901024503_retire_pin_feedback_data.sql`, this remote postflight evidence |
| PFDR-010~016, 040~045, 073 | private encrypted backup, complete/imported Class fingerprints, post-migration `lecture-slides` byte verification |
| PFDR-030~032 | official Storage CLI/API operation, zero-object and absent-bucket checks |
| PFDR-060~065 | private source/candidate manifests, dynamic reference calculation, Auth Admin delete/absence aggregates |
| PFDR-070~076 | `supabase/tests/pin_feedback_retirement.sql`, service/form changes, reset/test/lint/build/advisor/browser/Ponytail results above |

The Supabase service retirement is complete. Final privacy closure remains time-based: do not purge the encrypted backup before 2026-10-01T07:21:51Z, and record irreversible backup/identity-manifest deletion after that time unless legal hold or recovery work requires a separately approved extension.
