# Project Agent Instructions

## Mandatory Ponytail workflow

For every task that involves planning, designing, implementing, fixing,
refactoring, or reviewing code in this repository:

1. Use the globally installed `ponytail` skill before planning or design begins,
   and keep it active in `ultra` mode through implementation. Always run
   `/ponytail ultra` (never `lite` or `full`) unless the user explicitly asks for
   a different level in that session.
2. Ultra means YAGNI extremist: deletion before addition, ship the smallest thing
   that works and challenge the rest of the requirement in the same response.
3. Read and trace the affected code path end to end before choosing a solution.
   Apply Ponytail's ladder: avoid speculative work, reuse existing code, prefer
   standard-library and native platform features, reuse installed dependencies,
   and only then add the minimum code that works.
4. Do not simplify away explicit requirements, trust-boundary validation,
   data-loss prevention, error handling, security, accessibility, or the smallest
   runnable check required for non-trivial logic.
5. If ultra judgement says the requested scope should be cut, say so first in one
   line and wait for the user's decision. Never narrow a request on your own.
6. Before claiming an implementation is complete, use `ponytail-review` on the
   final diff, apply safe in-scope simplifications, and run the relevant checks.

If either required skill is unavailable, report that before making code changes.

## Token budget: which tool does which job

Three tools, three non-overlapping jobs. Use each only for its job.

- **Serena owns input tokens.** For code files: `get_symbols_overview` ->
  `find_symbol` (`include_body` only when you must read it) ->
  `find_referencing_symbols`. Never `Read` a code file for discovery and never
  `Edit` one you located through Serena; edit with `replace_symbol_body`,
  `insert_before_symbol` / `insert_after_symbol`, and `replace_in_files` for
  sub-symbol spans or the same change across files. Serena results are
  authoritative: do not re-read a file to confirm an edit landed. `Grep`/`Glob` stay
  allowed for discovery only; the follow-up read or reference search goes through
  Serena. Non-code files (`*.md`, `*.json`, migrations) keep using `Read`/`Edit`.
- **Ponytail ultra owns output tokens.** Fewest files, shortest working diff,
  deletion before addition, no unrequested prose. Explanation the user asked for is
  not debt; give it in full.
- **Headroom owns what is left, automatically.** The `headroom wrap` proxy
  compresses large tool outputs in flight and leaves a `hash=...` marker. Call
  `mcp__headroom__headroom_retrieve` only when a marker hid something the task
  actually needs. Do not call `headroom_compress` by hand: passing content as an
  argument means you already paid for it, and the proxy covers tool output.
  `headroom_stats` is for reporting, not for routine work.

Two cross-cutting rules, in order of impact:

1. **Batch independent tool calls into one message.** Every extra round-trip
   re-sends the whole conversation, so batching is the largest single lever. Serena
   applies batched calls serially, so they cannot race.
2. **Keep the prompt prefix stable.** `CLAUDE.md`, `AGENTS.md` and `DESIGN.md` are
   re-sent on every request and are only cheap while the provider cache holds them,
   which is why Headroom refuses to compress that frozen prefix. Edit these files
   when a rule changes, never to take notes.

## Weak Harness: project memory

Read this section and `DESIGN.md` before editing product code. It is the short,
repository-local context needed to continue work in a fresh session.

### What this project is

Pin Class is a desktop-first lecture interaction product. A Google-authenticated
instructor organizes uploaded PDF/PPT/PPTX decks, runs a live slide player, and
answers location-anchored student questions. Students enter through a public join
code and use an anonymous Supabase session. The sibling `/pin` route is a feedback
campaign product; do not mix its campaign types or UI into the Pin Class `/admin`
flow unless a task explicitly spans both products.

### Runtime and data boundaries

- Stack: Next.js 16 App Router, React 19, TypeScript, plain CSS, Supabase JS.
- Env files: `.env.local` holds the local Supabase + local backend (`npm run dev`);
  `.env.production.local` holds the remote Supabase + remote backend
  (`npm run dev:remote`, or `build`/`start`). Next.js fills keys missing from the
  active file from `.env.local`, so keep both files complete (decided 2026-10-15).
  The local Supabase stack only replays FE migrations and lacks
  backend-only migrations (`before`/`pending`, lifecycle RPCs); ignore that drift and
  never treat `supabase:reset` as proof of production schema. Load tests and full
  browser flows hit production: run them only in no-lecture hours, with user approval
  and an automatic stop condition.
- Business data goes through the OhPin Spring backend (`Team-Newdawn/ClassPin-BE`)
  via the same-origin proxy `/api/rest/[...path]` (`REST_API_URL`, default
  `https://ohpinbe.newdawn.co.kr`; production `NEXT_PUBLIC_DATA_MODE=rest`). The
  backend repository is read-only for this project: hand backend changes over as a
  guide, never edit it. Check API drift against the deployed spec
  (`https://ohpinbe.newdawn.co.kr/v3/api-docs`) and the backend source; its Swagger
  omits `status` on `PATCH /instructor/lectures/{id}` although the backend accepts it.
  A proxy `502 REST API unavailable` means the Next server's fetch never reached the
  backend (network/DNS/socket), not a backend error; backend errors pass through
  with their own status.
- Participant lecture state: 404 means missing, 204 (before start) and 410 (ended)
  both mean closed (`LectureClosedError`).
- Providers are composed in `app/layout.tsx`: language, auth, then session store.
- Instructor path: `/login` -> Google OAuth -> `/auth/callback` -> `/admin/dashboard`.
- Public participant path: `/join/[code]`; never place it behind the admin guard.
- Admin guard lives in `app/(view)/admin/layout.tsx` and must fail closed when Supabase is
  configured. Local demo mode may remain available when credentials are absent.
- `app/_controller/session-store.tsx` is the UI boundary. In Supabase mode Postgres is
  authoritative and localStorage is only an account-scoped failure cache. In demo
  mode localStorage + BroadcastChannel are authoritative.
- `app/_service/class-session-service.ts` owns REST and Supabase reads/writes, while
  `app/_infrastructure/supabase` owns client construction. Every new owner-visible
  table or column needs a forward-only migration and RLS-compatible access.
- Core model: Folder -> many ClassSession records; ClassSession maps to Course ->
  Lecture -> Material -> MaterialVersion -> Slides -> Questions/Answers.
- Never expose `Slide.speakerNote` to participant queries; the repository currently
  omits notes on audience reads and that trust boundary must remain intact.
- Load contract for live lectures (ported from `dev`): one coalesced session refresh
  in flight; participants never subscribe to `questions` postgres_changes, they get a
  `questions-changed` broadcast and refetch questions only after 0-10 s jitter;
  participant status polling is 30 s and pauses while the tab is hidden, falling back
  on `CHANNEL_ERROR`/`TIMED_OUT` to a per-tab random 15-20 s poll (instructor windows
  5 s); join lookup retries with backoff and jitter (max 5); `publishRealtimeReaction`
  reuses an already-subscribed channel; each participant sends at most one emoji
  reaction per second.
- Live audience count uses a heartbeat broadcast (participant tab -> instructor-only
  topic `lecture-audience:{id}`, every 60 s, 150 s window), never Realtime Presence:
  Presence fans every join/leave out to all participants (N^2 messages). The count is
  an approximate per-tab display value, not attendance.
- Deployment: pushing `dev` runs `.github/workflows/deploy-ec2.yml` to EC2. Repository
  secrets are `EC2_HOST`, `EC2_USER`, `EC2_SSH_KEY`, `EC2_KNOWN_HOSTS`, and `ENV_FILE`
  (one dotenv blob validated by `scripts/prepare-ec2-env.mjs`). Add server-only
  variables such as `GROQ_API_KEY` as a line inside `ENV_FILE` (re-upload the whole
  file); a new `NEXT_PUBLIC_*` also needs the script allowlist and a `Dockerfile` ARG
  and must never hold a secret. Never echo secret values in logs or chat.

### Current product contract

- `/` is an entry route, not an upload/marketing surface: signed-out users go to
  `/login`, signed-in instructors go to `/admin/dashboard`.
- The main admin dashboard is folder-first, supports folder-name search, and has
  no persistent sidebar.
- Opening a folder shows its material cards with a grid/list view switch. The
  folder page has no Insights tab (removed 2026-10-05).
- PDF/PPT/PPTX source uploads accept up to 1 GiB. In Supabase mode the browser
  uses resumable Storage upload and `/api/convert` receives only the owner-scoped
  source path; do not send large source bytes through Cloud Run request bodies.
- Source PDFs are read through `GET /api/pdf?path=…` with the requester's JWT, never
  through per-participant signed URLs. The route keeps the existing live-only RLS
  gate and a server disk cache; do not add a service-role bypass or long browser cache.
- Opening a material shows the live player. Its folder rail can collapse, its right
  question panel can resize, and speaker notes sit below the slide.
- New materials start not live. The folder's start button only opens the player;
  the player's own start/end button changes LIVE state.
- Leaving a LIVE player inside the app ends the lecture after 60 minutes unless
  that tab returns or another tab still holds its `player:{id}` or
  `presentation:{id}` Web Lock (browser timer, temporary; closing the tab keeps
  LIVE until a server-side expiry exists).
- The right question panel starts with an AI summary of the current slide's
  questions, shown only when that slide has questions. `POST /api/question-summary`
  calls Groq with the server-only `GROQ_API_KEY` and returns 503 without it.
- Instructor insights (`/admin/insights`, `app/api/admin/ai-reports/*`) analyze the stored
  source PDF plus redacted questions with one AI provider per server (`INSIGHT_AI_PROVIDER` claude|openai|gemini,
  default claude; `INSIGHT_AI_MODEL`, default `claude-haiku-5-5`; server-only `CLAUDE_API_KEY`/`OPENAI_API_KEY`/`GEMINI_API_KEY`)
  inside Next `after()`: poppler renders each page to a JPEG plus its text layer, one call per
  20-page chunk in parallel (PIN positions as image pixels), one merge call, code-only validation, no worker or critic.
  Provider-neutral flow lives in `app/_service/insight-ai.ts`; each provider is one adapter in `app/_service/insight-providers/`.
  Design and superseded rules: `docs/insights-ai-foundation.md` sections 10-11.
- The player header shows the LIVE elapsed time from the backend `started_at` (reset
  on every LIVE start) and the live audience count. The end-lecture dialog summarizes
  duration, participants, and questions; elapsed time freezes when that dialog opens
  and the values stay visible while the end is saving.
- Lecture preparation toggles `allow_question_reactions` (empathy button) and
  `allow_emoji_reactions` (emoji tools and reactions); the join page hides each
  control when it is off.
- On the join page, clicking a question card moves to its slide and shows only that
  PIN; other participants' PINs show only while `showQuestionPins` is on.
- A right-panel question item only selects its slide, dims the slide, and highlights
  and enlarges its PIN in blue, expanding its cluster if needed. Only clicking a PIN opens the detail dialog; a PIN cluster opens
  a popover (AI summary + questions); a popover item enlarges and raises its PIN,
  and clicking that PIN opens the dialog. Answer and
  resolve actions live in that dialog, never inline in the right panel.
- While live questions are enabled, the presentation starts PIN reveal afresh on
  every slide visit and advances one second after every PIN is visible. PIN-free
  slides retain the three-second fallback. A new positioned question immediately
  jumps to its slide and restarts that slide's full reveal cycle with the new PIN,
  including when it arrives on the current slide. PIN reveal and automatic movement
  pause while a question detail dialog is open; changing slides closes that dialog.
- Only the first presentation window opened in a browser (Web Locks) writes the live
  slide. Later windows behave like the participant page: they follow the live slide,
  local navigation changes only that window and shows a "back to presenter" button,
  and meeting the live slide again resumes following. They never affect the first
  window or participants. Closing the first window hands control to the next one.
- The live/stop state must be visually and textually explicit. The filmstrip has a
  visible horizontal scrollbar, marks the active slide with a blue border, offers
  slide deletion from a per-thumbnail menu, and ArrowLeft/ArrowRight navigate
  slides except while the user is editing text or another form control. Speaker
  notes default to two lines; dragging their top handle up grows them and shrinks
  the slide.
- Keep the stage toolbar at a stable minimum height while the question panel is
  resized; above the stacked breakpoint preserve at least 400px for the stage, and
  truncate its title/sync copy before allowing it to overlap the actions or canvas.
- Question types are hidden everywhere (temporary): participants submit the
  lecture's first enabled category; BE/DB still require `category`.
- The presentation remote (`/remote#token`, public, no login; spec
  `docs/lecture-roles-and-remote.md`) is issued only by the owner from the lecture
  management page. The first anonymous browser to open it holds it and others see
  "in use"; it moves `current_page` one step via `ohpin_remote_control` only while
  LIVE. Reissuing or leaving LIVE revokes it. Never show its link on the projected
  presentation.
- Do not restore the text-slide creator. Existing image slide append/delete behavior
  remains supported.
- Preserve accessible names, focus-visible behavior, semantic tabs/switches, and
  keyboard reachability for every new control.

### Change map

- Entry/auth: `app/(view)/page.tsx`, `app/(view)/login/page.tsx`,
  `app/(view)/auth/callback/page.tsx`, `app/_controller/auth-context.tsx`,
  `app/(view)/admin/layout.tsx`.
- Folder dashboard/detail: `app/(view)/admin/dashboard/page.tsx`,
  `app/(view)/admin/folders/[id]/page.tsx`, `app/_controller/session-store.tsx`.
- Live material workspace: `app/(view)/admin/session/[id]/page.tsx`.
- Persistence: `app/_model/types.ts`, `app/_service/class-session-service.ts`,
  `app/_infrastructure/supabase/client.ts`, `supabase/migrations/*`.
- Visual rules and responsive behavior: route and component `*.module.css` files;
  `app/globals.css` owns only tokens and shared primitives. Reuse tokens from
  `DESIGN.md`, and do not introduce direct hex colors when a semantic token exists.
- Shared statistics: `app/_model/stats.ts`. Keep aggregation functions pure and testable.
- The retired `/pin` feedback runtime must not be restored. Its historical
  database and Storage contracts remain migration history unless a task explicitly
  authorizes destructive data retirement.

### Minimum completion gate

1. Trace the affected route from UI through store/repository/migration and back.
2. Run `npm run lint` and `npm run build`. Replay migrations with
   `npm run supabase:reset` only when the change adds an FE migration.
3. Run the smallest targeted Node test for any new non-trivial pure logic.
4. Exercise login redirect, folder open, grid/list switch, material
   open, panel collapse/resize, note save, scrollbar, and keyboard slide navigation
   in the child workspace browser.
5. Run `ponytail-review` on the final diff, apply safe simplifications, then repeat
   the relevant checks before claiming completion.

## Document-based changes

Before changing product code, read the PRD and the approved documents relevant
to the affected path in `docs/document-manifest.json`. Implement only the
approved behavior and preserve their security, data, accessibility, and
verification constraints. If the code requires a decision those documents do
not cover, update and approve the document before continuing. No generated
context lock, hook, package lock, or document-driven harness is required.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
