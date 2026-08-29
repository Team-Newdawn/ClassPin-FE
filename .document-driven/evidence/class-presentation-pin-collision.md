# Class presentation PIN collision evidence

- Date: 2026-08-28
- Requirement: `CLASS-PRES-001`
- Browser: Orca workspace browser, isolated demo server at `http://localhost:3011`

## Automated verification

- `node --test lib/pin/presentation-rotation.test.ts` passed all 5 tests.
- The existing collision test spread 30 PINs sharing the same center or edge coordinate without overlap and kept every position within the canvas.
- `npm run lint` passed.
- `npm run build` passed with the pre-existing Turbopack NFT warning for `app/api/convert/route.ts`.

## Browser verification

- Loaded a temporary Class presentation with 12 point PINs sharing `x: 0.5`, `y: 0.5` and long question bodies.
- At the sampled autoplay state, 6 rendered PINs produced 5 displacement lines and 0 pairwise PIN collisions.
- Of 6 rendered speech bubbles, 5 colliding inactive bubbles were hidden, the active bubble remained visible, and the retained bubbles had 0 pairwise collisions.
- The temporary demo server and data were isolated from the workspace's configured Supabase environment.
