# Participant Pen removal verification

- Task: `remove-participant-pen-tool`
- Requirements: `CLASS-JOIN-001`, `CFA-010`, `CFA-020`, `CFA-042`,
  `CFA-060`, `CFA-061`, `CFA-062`, `CFA-080`, `CFA-081`, `CFA-086`,
  `CFA-087`

The participant `/join/[code]` tool switch now contains only PIN and Emoji.
Pen pointer sampling, path draft state, path/box draft rendering, Pen CSS and
Pen-specific Korean/English messages were removed. The controller always sends
an explicit point anchor, and the shared Facade/service contract validates the
same normalized point shape in Supabase and demo modes.

The forward-only migration narrows the existing participant anchor INSERT policy
to `kind = 'point'`. It does not alter the anchor kind/check constraints or
delete rows, so historical box/path anchors remain available to the existing
question mapper and shared `SlideCanvas` renderer.

Verification evidence:

- test-first model check initially failed because `isParticipantPointAnchor`
  did not exist; the final targeted Node test passes point, path, box and
  out-of-range cases
- test-first pgTAP check initially failed because a participant path INSERT did
  not throw; after the migration, point INSERT passes, path INSERT fails with
  RLS error `42501`, and a pre-existing path row remains stored
- `npm run supabase:start` and `npm run supabase:reset` replayed every migration
  from a clean local database
- all 21 Node tests passed
- `supabase test db --local supabase/tests/participant_point_anchors.sql` passed
  all three policy tests; invoking the entire `supabase/tests` directory still
  reports the pre-existing TAP parse issue for the assert-only
  `class_deletion.sql` and `class_question_import.sql` files
- Chrome at 1512×861 loaded a local Supabase live participant session: the
  accessibility toolbar exposed exactly PIN and Emoji, Emoji opened its four
  reactions, a slide click opened the point composer, and submission succeeded
- the browser-created question joined to a `region_anchors` row with
  `kind = 'point'` and normalized `x`/`y` coordinates
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for
  `next.config.ts` / `app/api/convert/route.ts`
- document manifest, Direct-Strict baseline, task lock and final `docflow verify`
  passed; this was a direct single implementation, so no orchestration run file
  was created
- Ponytail review shortened the participant input contract to the four question
  fields plus the point shape; final result: `Lean already. Ship.`
