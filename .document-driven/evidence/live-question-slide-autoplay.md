# Live question slide autoplay evidence

Task: `live-question-slide-autoplay`

## Behavior

- When live questions are enabled and the deck has at least two slides, the presentation advances every 3 seconds and wraps from the last slide to the first.
- A newly received positioned question is detected across the whole deck, moves the presentation to its slide immediately, and highlights its PIN.
- Opening a PIN detail dialog pauses slide autoplay; closing it starts a fresh 3-second interval.
- Turning live questions off stops slide autoplay.

## Automated verification

- Test-first failure: the targeted Node test initially failed because `nextPresentationSlide` and `findNewestIncomingPin` did not exist.
- `node --test --experimental-strip-types app/_model/class/presentation-rotation.test.ts`: 8 passed.
- Full Node test suite: 27 passed across 11 files.
- `npm run supabase:start`: passed.
- `npm run supabase:reset`: clean migration replay passed.
- `npm run lint`: passed.
- `npm run build`: passed.

## Browser verification

Local demo data used a live three-slide session.

- Presentation changed `1 / 3` → `2 / 3` → `3 / 3` → `1 / 3` at approximately 3-second intervals.
- With live questions disabled, the presentation remained on `1 / 3` for longer than 3 seconds.
- After enabling live questions, a positioned question inserted on slide 3 changed the presentation immediately to `3 / 3` and rendered its PIN.
- While that PIN's detail dialog was open, the presentation remained on `3 / 3` for longer than 3 seconds; after closing it, autoplay resumed at `1 / 3`.
- Regression journey passed for login redirect, folder open, grid/list switch, Insights scope dropdown, material open, folder rail collapse, question panel keyboard resize, speaker-note save, filmstrip horizontal overflow behavior, and keyboard slide navigation.
