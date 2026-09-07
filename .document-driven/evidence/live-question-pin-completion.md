# Live question PIN completion evidence

Task: `live-question-pin-completion`

## Behavior

- The presentation reveals current-slide PINs one at a time and starts the 3-second slide timer only after every PIN is visible.
- A slide without PINs still advances after 3 seconds.
- Revisiting a slide restarts its PIN sequence instead of restoring an already-complete sequence.
- A new positioned question on another slide cancels the pending timer, jumps to that slide immediately, highlights the new PIN, then reveals the remaining PINs before advancing.

## Test-first verification

- The focused Node test first failed because `canRotatePinPlayback` did not yet account for already-visible PINs.
- After implementation, `node --test --experimental-strip-types app/_model/class/presentation-rotation.test.ts` passed all 8 tests.

## Browser timing evidence

Local demo data used three slides, with five existing PINs on slide 1 and no PINs on slides 2 and 3.

- Initial slide 1 PIN counts increased `1 → 2 → 3 → 4 → 5`; after all five were visible, slide 2 appeared approximately 3.0 seconds later.
- Empty slides 2 and 3 each advanced after approximately 3.0 seconds.
- Returning to slide 1 began again with one visible PIN, proving completed playback was not reused.
- While slide 2 was visible, a new PIN for slide 1 changed the presentation immediately to slide 1 with only the new PIN selected. Counts then increased `1 → 2 → 3 → 4 → 5 → 6`, and slide 2 appeared approximately 3.0 seconds after the sixth PIN.
- Repeated near-expiry insertion confirmed the previous timer was cancelled rather than moving away immediately after the new-PIN jump.

## Repository verification

- `npm run supabase:start`: passed.
- `npm run supabase:reset`: clean migration replay passed.
- Full model Node suite: 25 passed.
- `npm run lint`: passed after removing a redundant effect state update.
- `npm run build`: passed, including TypeScript and production route generation.
- Ponytail review replaced the one-shot slide transition interval with `setTimeout`; no dependency or abstraction was added.
