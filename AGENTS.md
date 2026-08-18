# Project Agent Instructions

## Mandatory Ponytail workflow

For every task that involves planning, designing, implementing, fixing,
refactoring, or reviewing code in this repository:

1. Use the globally installed `ponytail` skill before planning or design begins,
   and keep it active in `full` mode through implementation.
2. Read and trace the affected code path end to end before choosing a solution.
   Apply Ponytail's ladder: avoid speculative work, reuse existing code, prefer
   standard-library and native platform features, reuse installed dependencies,
   and only then add the minimum code that works.
3. Do not simplify away explicit requirements, trust-boundary validation,
   data-loss prevention, error handling, security, accessibility, or the smallest
   runnable check required for non-trivial logic.
4. Before claiming an implementation is complete, use `ponytail-review` on the
   final diff, apply safe in-scope simplifications, and run the relevant checks.

If either required skill is unavailable, report that before making code changes.

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
- Local development always uses the Supabase CLI-managed Docker stack. Start it
  with `npm run supabase:start`; do not point local feature work at production.
  Verify schema changes from a clean database with `npm run supabase:reset`.
- Providers are composed in `app/layout.tsx`: language, auth, then session store.
- Instructor path: `/login` -> Google OAuth -> `/auth/callback` -> `/admin/dashboard`.
- Public participant path: `/join/[code]`; never place it behind the admin guard.
- Admin guard lives in `app/admin/layout.tsx` and must fail closed when Supabase is
  configured. Local demo mode may remain available when credentials are absent.
- `components/session-store.tsx` is the UI boundary. In Supabase mode Postgres is
  authoritative and localStorage is only an account-scoped failure cache. In demo
  mode localStorage + BroadcastChannel are authoritative.
- `lib/supabase/repository.ts` owns Supabase reads/writes. Every new owner-visible
  table or column needs a forward-only migration and RLS-compatible access.
- Core model: Folder -> many ClassSession records; ClassSession maps to Course ->
  Lecture -> Material -> MaterialVersion -> Slides -> Questions/Answers.
- Never expose `Slide.speakerNote` to participant queries; the repository currently
  omits notes on audience reads and that trust boundary must remain intact.

### Current product contract

- `/` is an entry route, not an upload/marketing surface: signed-out users go to
  `/login`, signed-in instructors go to `/admin/dashboard`.
- The main admin dashboard is folder-first, supports folder-name search, and has
  no persistent sidebar.
- Opening a folder shows its material cards with a grid/list view switch and an
  Insights tab in the page header; Insights is not a sidebar destination. Inside
  that tab, chips switch between the folder aggregate and each material's own
  insight scope.
- Opening a material shows the live player. Its folder rail can collapse, its right
  question panel can resize, and speaker notes sit below the slide.
- The live/stop state must be visually and textually explicit. The filmstrip has a
  visible horizontal scrollbar, marks the active slide with an error-red border,
  and ArrowLeft/ArrowRight navigate slides except while the user is editing text
  or another form control. Speaker notes resize vertically with the native handle.
- Keep the stage toolbar at a stable minimum height while the question panel is
  resized; above the stacked breakpoint preserve at least 400px for the stage, and
  truncate its title/sync copy before allowing it to overlap the actions or canvas.
- Do not restore the text-slide creator. Existing image slide append/delete behavior
  remains supported.
- Preserve accessible names, focus-visible behavior, semantic tabs/switches, and
  keyboard reachability for every new control.

### Change map

- Entry/auth: `app/page.tsx`, `app/login/page.tsx`, `app/auth/callback/page.tsx`,
  `components/auth-context.tsx`, `app/admin/layout.tsx`.
- Folder dashboard/detail: `app/admin/dashboard/page.tsx`,
  `app/admin/folders/[id]/page.tsx`, `components/session-store.tsx`.
- Live material workspace: `app/admin/session/[id]/page.tsx`.
- Persistence: `lib/types.ts`, `lib/supabase/repository.ts`,
  `supabase/migrations/*`.
- Visual rules and responsive behavior: `app/globals.css`; reuse tokens from
  `DESIGN.md`, do not introduce direct hex colors when a semantic token exists.
- Shared statistics: `lib/stats.ts`. Keep aggregation functions pure and testable.
- The `/pin` tree and `lib/pin/*` are a separate surface even where names overlap.

### Minimum completion gate

1. Trace the affected route from UI through store/repository/migration and back.
2. Start Docker, run `npm run supabase:start`, then verify a clean migration replay
   with `npm run supabase:reset` before `npm run lint` and `npm run build`.
3. Run the smallest targeted Node test for any new non-trivial pure logic.
4. Exercise login redirect, folder open, grid/list switch, Insights tab, material
   open, panel collapse/resize, note save, scrollbar, and keyboard slide navigation
   in the child workspace browser.
5. Run `ponytail-review` on the final diff, apply safe simplifications, then repeat
   the relevant checks before claiming completion.
