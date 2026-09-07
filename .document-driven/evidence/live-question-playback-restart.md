# Live Question PIN playback restart

Task: `live-question-playback-memory` (rule revised by the user's 2026-09-06 request).
Supersedes the remembered-progress behavior in `live-question-playback-memory.md`.

## Approved behavior and implementation

- `CLASS-LIVE-003`: every slide visit starts PIN reveal afresh. An incoming positioned question immediately selects its slide and starts a full cycle with that new PIN, even on the current slide. Completion still advances after one second; empty slides use three seconds.
- PRD, DESIGN.md and AGENTS.md now record that requested rule. Existing architecture approval is unchanged; context document and slice hashes were synchronized and checked directly. The repository has no `docflow.py` and does not require installing a generated harness.
- `CFA-010`, `CFA-012`: presentation state stays in the existing controller. Removed the per-slide Map and its unused helper; reused `advancePinPlayback` and existing timers.
- `CFA-054`, `CFA-059`: preserved Supabase subscriptions, optimistic current-page writes and stale-response guards. Demo mode now uses one BroadcastChannel instance for sending and receiving so its own prior snapshot cannot undo an incoming-PIN jump. The existing lifecycle closes the channel on unmount.
- Detail dialogs pause playback; incoming questions on another slide close the old dialog so playback can resume on the destination. Same-slide arrivals preserve the open dialog and pause the restarted cycle.

## Browser verification

Orca's current workspace browser, isolated local origin `http://127.0.0.1:3100`, demo session `pin-replay-check`. Timings sampled from rendered slide/PIN DOM every 100ms using `orca eval`.

- Before the change, revisited slides immediately displayed all three old PINs and skipped to the next slide after one second.
- After the change, slide 1 showed 1 / 2 / 3 PINs at 706 / 1714 / 2726ms, then slide 2 began at 3739ms. Slide 2 completed at 5761ms and advanced at 6772ms. Empty slide 3 returned to slide 1 at 9713ms, starting again with one PIN.
- A cross-slide incoming PIN appeared alone on its target within 101ms. Five PINs completed at 4049ms and the next slide appeared at 5062ms. No bounce back occurred after the BroadcastChannel fix.
- Same-slide incoming PIN restarted visibility with exactly that PIN. An open detail dialog kept that state paused; closing it revealed the second PIN after one second.
- Incoming PIN on a different slide closed the old dialog, moved immediately, and resumed revealing the destination's other PINs.
- Live Question OFF remained on its slide with zero PINs through a new question and a 3.4-second wait. Turning it on did not treat that older arrival as new.
- Editing an existing question did not restart playback. Manual departure and revisit changed the visible count from two back to one.
- `/` redirected to `/login`; dashboard, folder open, grid/list (`aria-pressed=true`), Insights and material open succeeded. Fixture questions initially used `body` instead of required `text`; corrected that test fixture before the successful admin checks.
- Folder rail collapsed and reopened. Separator keyboard adjustment changed 380px to 399px. Speaker note `PIN replay regression note` persisted; native textarea resize remains vertical. ArrowRight/ArrowLeft changed the stored slide 0 -> 1 -> 0.
- Ten fixture slides produced filmstrip overflow; horizontal scrolling was checked after layout settled.

## Checks and review

- Docker was running; `npm run supabase:start` succeeded.
- `npm run supabase:reset` replayed every migration and seed successfully.
- Full existing Node model/infrastructure suite: 28 passed. Focused presentation tests: 9 passed, including the new-PIN full-cycle check; repeated after review.
- `npm run lint`: passed after the final code changes.
- `npm run build`: passed after the final code changes, including TypeScript and route generation.
- `git diff --check`: passed.
- Ponytail review on this task's diff against saved starting contents: `Lean already. Ship.` No dependency or speculative abstraction added.
- Document verification checked full hashes, pack slices, manifest approval and actual trace paths. Earlier uncommitted changes were preserved.

Browser timing and regression checks used demo transport. Google OAuth and live Supabase question delivery were not exercised in the browser; local Google provider credentials are unset. No auth, database, RLS, participant payload or speaker-note access code changed.
