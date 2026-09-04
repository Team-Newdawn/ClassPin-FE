# Session folder rail accent verification

- Task: `session-folder-rail-accent-regression`
- Requirements: `CFA-002`, `CFA-031`, `CFA-037`
- Browser tab: `76d135b2-d10d-42ff-a43c-df43a2304319`
- Route: `/admin/session/c9163eb7-61c0-407d-b486-9fe29fb03519`

The route CSS moved beside the session view, but its folder accent selectors still
required `folder-accent-*` to be on the CSS Module root. The class is rendered on the
descendant folder rail, so `--folder-accent` was undefined and both the SVG mask and
active material highlight lost their folder color.

The six selectors now target descendant `folder-accent-*` classes. The existing
`file_list_icon.svg` mask and active-link color mixes remain unchanged and inherit the
same semantic visualization token.

Browser computed-style verification confirmed:

- rail class: `session-folder-rail folder-accent-2`
- folder accent: `#3478f6`
- icon: `21px × 24px`, `rgb(52, 120, 246)`, mask URL ending in `file_list_icon...svg`
- active link: `aria-current="page"`, 12% folder-accent background, 35% folder-accent border
- folder rail navigation and current-page accessible names remained present

Verification commands:

- static selector regression check — failed before the change and passed after it
- Orca browser selector wait, accessibility snapshot, and computed-style evaluation — passed
- `npm run supabase:start` — passed
- `npm run supabase:reset` — passed; all local migrations replayed from a clean database
- `npm run lint` — passed
- `npm run build` — passed, with the existing Turbopack NFT tracing warning for `next.config.ts` / `app/api/convert/route.ts`
- Ponytail review — `Lean already. Ship.`
- `git diff --check` — passed
