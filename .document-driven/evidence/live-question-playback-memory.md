# Live question playback memory evidence

Historical behavior: superseded by the 2026-09-06 rule revision in [live-question-playback-restart.md](live-question-playback-restart.md).

Task: `live-question-playback-memory`

## Behavior

- The presentation stores revealed PIN ids separately for each slide in presentation-window memory.
- Revisiting a partially or fully revealed slide restores its prior visible PINs and continues from that state.
- A slide with PINs advances one second after its last PIN becomes visible; a PIN-free slide retains the three-second fallback.
- A newly received positioned question still jumps to its slide immediately, appends the new PIN to that slide's remembered state, and applies the one-second completion delay.

## Test-first verification

- The focused Node test first failed because `rememberSlidePinPlayback` did not exist.
- After implementation, `node --test --experimental-strip-types app/_model/class/presentation-rotation.test.ts` passed all 9 tests.
- The test proves immutable per-slide storage, isolation between slide entries, and continuation from a remembered PIN list.

## Browser timing evidence

Local demo data used three slides: four PINs on slide 1, three PINs on slide 2, and no PINs on slide 3.

- Slide 1 showed four PINs at 1,508ms and changed to slide 2 at 2,518ms, approximately 1.01 seconds after completion.
- After leaving slide 1 with three visible PINs, revisiting restored the same three ids immediately; the fourth appeared approximately one second later.
- A fresh visit to the PIN-free slide remained there through 2,762ms and advanced at 3,012ms.
- A new slide-2 PIN inserted while slide 3 was visible caused slide 2 and all five remembered/new PINs to appear in the next 100ms sample; slide 3 appeared approximately 1.11 seconds later.
- Browser console output contained only React development/HMR informational messages; observed page and asset requests completed successfully.

## Regression journey

- `/` redirected to `/login`; the demo entry opened `/admin/dashboard`.
- Folder open, grid/list switch, Insights tab and its accessible scope dropdown, and material open succeeded.
- Folder rail collapse/reopen succeeded; the question panel separator changed from 380px to 359px by keyboard.
- Speaker-note save persisted the exact value to the demo session.
- A ten-slide fixture produced horizontal filmstrip overflow (`1,152px > 608px`) and scrolled to its 544px maximum.
- ArrowLeft changed the active slide from index 2 to index 1.

## Repository verification

- `npm run supabase:start`: passed.
- `npm run supabase:reset`: clean migration replay passed.
- Full model Node suite: 26 passed.
- `npm run lint`: passed.
- `npm run build`: passed, including TypeScript and production route generation.
- Ponytail final diff review: `Lean already. Ship.` No dependency, configuration, persistence layer, or speculative abstraction was added.
