# Session live tab icon verification

- Task: `session-live-tab-icon`
- Requirement: `CLASS-DASH-003`
- Browser tab: `8cb3a6b7-6cb7-487c-9bd7-82de489d2aa6`
- Route: `/admin/session/c9163eb7-61c0-407d-b486-9fe29fb03519`

The live-player tab now renders the official `at-icons:play` 16×16 viewBox and path directly. Other Lucide `Play` usages, including the session start action, remain unchanged.

Browser computed-style and DOM verification confirmed:

- the live tab SVG no longer has a Lucide class
- viewBox: `0 0 16 16`
- rendered icon size: `17×17px`
- active button and icon color: `rgb(0, 105, 240)` (`#0069F0`)
- accessible button name remained `라이브 플레이어 0`

Verification commands:

- Orca browser selector wait, DOM path comparison, and computed-style evaluation — passed
- Orca browser accessibility snapshot — passed
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- Ponytail review — `Lean already. Ship.`
- `git diff --check` — passed
