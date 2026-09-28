# REST business API verification — 2026-09-28

## Reviewed contract and implementation

- FE baseline: `origin/feature-dev` at `e00739aead3abe27efeb5135797f4f43c21e2bb5`; implementation branch: `dev`.
- Contract: deployed `https://ohpinbe.newdawn.co.kr/v3/api-docs` (29 operations) and Team-Newdawn/ClassPin-BE `main` at `86b65be858d1892d11da0f9d300240b6d25e2e71`. Backend source confirms camelCase request DTOs, snake_case graph projections, snake_case lecture PATCH, folder purpose, autoplay, participant question ownership projection, and pending Storage cleanup.
- Architecture reviewed and approved under the user's explicit delegated authority. Dependent retirement documents are unchanged; their approval hashes were refreshed together. CFA-090 through CFA-099 have code/test trace records.
- Every existing frontend business database read/write now uses REST, including profile and participant experience. Auth, anonymous audience sessions, Storage, Realtime and demo data retain their existing boundaries. No new dependency or migration.
- Browser requests use `/api/rest/*`; server target is a configured origin, defaulting to the deployed HTTPS backend. Only caller JWT and Content-Type are forwarded; browser Origin/cookies are stripped. Native rewrites were rejected after an HTTP probe showed they preserve Origin and the deployed backend rejects localhost preflight.
- Deletion reflects committed database removal before reporting pending file cleanup. The backend owns cleanup jobs. Participant slide mapping omits instructor notes even when an injected response includes them.
- The baseline has no standalone slide append controller/service. Existing slide creation is sent in the material creation DTO; no unused append API wrapper or new UI was introduced.

## Executed checks

- `npm run supabase:start`: local CLI-managed Docker database/auth/storage active.
- `npm run supabase:reset`: all migrations replayed successfully from a clean local database.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and Next production route generation.
- `node --experimental-strip-types --test app/_model/*.test.ts app/_model/class/*.test.ts app/_infrastructure/supabase/fetch-retry.test.ts app/_infrastructure/rest/request.test.ts app/_service/class-session-service.rest.test.ts`: 37 passed, 0 failed.
- `node --experimental-strip-types 'app/api/rest/[...path]/route.test.ts'`: 1 passed, 0 failed. This exact-file invocation avoids the test runner treating the bracketed route directory as a glob.
- Request checks cover caller JWT, owner/anonymous segregation, no request on missing/wrong identity, JSON DTOs, empty 204, 403, 404 and plain-text 502 errors. Service checks forbid direct Supabase business CRUD, cover folder purpose, material creation/autoplay, questions/answers/reactions, participant note exclusion, experience and cleanup state.
- Real local HTTP proxy check verifies Origin/cookie removal, Authorization and sourcePath/fileName preservation, delayed NDJSON chunks, missing-token rejection and unsafe origin rejection.
- Final `ponytail-review`: removed dead owner-token client/comments. Fixed streaming Route Handler and one request function reuse native fetch; tests reuse installed TypeScript. No further safe in-scope simplification: “Lean already. Ship.”
- Document gate: `docflow.py verify --root . --ci --base-ref origin/feature-dev` and Git whitespace check passed.

## Browser evidence and limits

Orca child-workspace browser at localhost:3001 used a disposable local Supabase account and actual local Auth/Storage, with a local HTTP fixture for business responses. JWTs were validated by local Supabase. Disposable account/files/env were cleaned up and prior browser localStorage restored.

- Profile, folder and course loading reached the REST upstream with no browser Origin. No `/rest/v1` business requests appeared in resource entries.
- Folder open, grid/list aria-pressed transitions, and the Insights tab with accessible scope selector were checked.
- Material details and live material workspace opened. Folder panel collapsed; keyboard separator handling resized the question panel from 380px to approximately 400px.
- Note PUT returned 204 and “REST note saved through API” survived a page reload through fresh REST course data.
- ArrowRight/ArrowLeft handlers changed slides and sent lecture PATCH. ArrowRight while editing the textarea retained the slide. These checks used browser DOM keyboard events when Orca's native key injection did not change state.
- Filmstrip has `overflow-x: auto`; speaker note has native vertical resize. The three-slide fixture fit in the collapsed layout, so scrollbar overflow was not separately stress-tested.
- Removing the owner session and opening `/admin/dashboard` redirected to `/login?next=%2Fadmin%2Fdashboard`, preserving the fail-closed admin guard. Demo entry redirect was also checked before connected-mode verification.

This is verified frontend integration against the reviewed backend contract, not production end-to-end certification. Google OAuth credentials were unavailable locally. The existing local stack lacks its Realtime container, so live Realtime delivery was not exercised; subscriptions remain unchanged. Actual production JWT/RLS behavior, live participants, and full backend PPT conversion were not exercised. A participant request from an incidental presentation tab after logout received the fixture's unsupported-route 404; participant service projection is covered by the runnable REST tests, not that browser fixture. Deployment must use frontend and backend credentials from the same Supabase project.
