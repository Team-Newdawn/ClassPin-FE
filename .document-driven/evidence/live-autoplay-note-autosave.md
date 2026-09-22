# Live autoplay and speaker-note autosave evidence

## Scope

- Requirements: `CLASS-UPLOAD-003`, `CLASS-LIVE-001`, `CLASS-LIVE-003`, `CLASS-LIVE-005`, and the locked `CFA-*` implementation, security, accessibility, and verification requirements in task `live-autoplay-note-autosave`.
- The live toolbar no longer exposes or imports the post-upload image-slide append path. Existing image/PDF slide rendering and slide deletion remain intact; historical migrations and Storage contracts were not removed.
- A semantic `슬라이드 자동 넘김` switch updates the lecture-scoped `presentation_autoplay` value. The value defaults to `false`, is included in owner/audience snapshots and lecture Realtime payloads, and drives only timed movement in the presentation controller.
- When autoplay is enabled, a PIN-free slide or a slide with live PIN display disabled advances after three seconds. With live PIN display enabled, it waits until every PIN is shown and advances one second later. A detail dialog or a one-slide deck prevents timed movement, and the existing incoming-question jump path remains independent of autoplay.
- Speaker notes have no manual save button or keyboard shortcut. Each slide draft is retained locally and queued for the existing owner-only note mutation after ten seconds of inactivity, textarea blur, or slide change. A failed write leaves the pending draft available and exposes the existing retryable error alert. Pending, saving, saved, and idle-autosave states use a polite live status.

## Commands and results

- `npm run supabase:start`: passed; the CLI-managed local stack was already running.
- `npm run supabase:reset`: passed from a clean local database through `20260910120000_add_lecture_presentation_autoplay.sql`.
- `npx supabase test db supabase/tests/lecture_presentation_autoplay.sql`: 3/3 passed, covering default OFF, owner update, and participant update rejection through RLS.
- `supabase db push --linked --dry-run`: confirmed `20260910120000_add_lecture_presentation_autoplay.sql` was the only pending remote migration.
- `supabase db push --linked --yes`: applied that migration to the linked remote project; the follow-up migration list shows matching local and remote version `20260910120000`.
- `node --test app/_model/class/presentation-rotation.test.ts app/_model/class/session.test.ts`: 14/14 passed, including autoplay timing gates, legacy-session default normalization, and exclusion of speaker notes from the Supabase failure cache.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 16.3.3, including TypeScript, page-data collection, and route generation.
- `git diff --check` and active append-path searches: passed; no live UI/controller/service append reference remains.
- Document-driven `validate`, `check-baseline`, `check-lock`, and final `verify`: passed with complete traceability for `live-autoplay-note-autosave`. `check-run --audit` is not applicable because this is a direct single-agent task and has no orchestration run file.
- `ponytail-review`: the one-use autoplay custom hook was inlined into the existing presentation controller effect, reducing the implementation by nine lines. No other safe complexity-only deletion remained.

## Browser verification

- The supplied 1291px admin route exposes the new labelled autoplay switch in the stage toolbar, retains slide deletion, and has no slide-add control. Speaker notes expose a textbox, character count, and autosave status with no manual save button.
- An isolated port-3001 demo-mode run exercised the same final UI/controller paths without touching the supplied server's remote Supabase configuration:
  - Editing a note showed `저장 대기 중`; after ten seconds it changed to `저장됨`, and local persistence contained the new slide note.
  - Editing again and changing slides persisted the latest draft immediately; the destination slide rendered normally.
  - A second presentation tab received the autoplay switch through the existing demo `BroadcastChannel`, cycled a PIN-free three-slide deck at the three-second interval, and stopped on the same slide for more than one interval immediately after the switch changed to OFF.
  - Entering out-of-range page `99` and pressing Enter did not move the slide and restored the current page number.
  - The accessibility snapshot exposed `슬라이드 자동 넘김 켜기/끄기` as a checked-state switch, the slide navigation landmark, the labelled number spinbutton, and the speaker-note status region.
- After the approved remote deployment, a fresh port-3000 tab loaded the selected session without the former missing-column issue and exposed the persisted OFF value through the autoplay switch. The live lecture value was not toggled merely for testing, avoiding an observable change in any open presentation window.

## Trust boundary

- `speakerNote` remains mapped only on owner reads. Audience session reads, lecture Realtime rows, and question/report evidence were not extended with speaker notes.
- `presentation_autoplay` is intentionally readable in live session snapshots so a presentation window can follow it, but the existing lecture owner RLS policy remains the only write path; the SQL test confirms participant writes do not change the value.
