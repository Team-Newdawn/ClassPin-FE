# OhPin visible branding evidence

## Scope

- Requirement: `CLASS-BRAND-001`
- User-visible platform name: `OhPin`
- Canonical logo asset: `assets/logo/ohpin_logo.svg`
- Compatibility boundary: existing routes, storage keys, data models, and internal `Pin Class` / `pin-class` identifiers remain unchanged.

## Implementation

- `app/component/pin-logo.tsx` renders the canonical logo in every shared instructor and participant header with an accessible `OhPin · Home` link name.
- `app/component/folder-tree-sidebar.tsx` reuses the shared logo instead of importing a separate legacy asset.
- Component-owned CSS preserves the supplied SVG aspect ratio and limits its rendered size within existing header heights.
- `app/layout.tsx` and the login footer expose `OhPin` as the browser and platform name.

## Validation

- `npm run supabase:start`: passed; the repository-local Supabase stack was already running.
- `npm run supabase:reset`: passed; all migrations replayed from a clean local database.
- `npm run lint`: passed.
- `npm run build`: passed with Next.js 16.3.3 and TypeScript checks.
- Orca browser `/login`: document title `OhPin`, footer `OhPin · 질문을 강의의 지식으로`, shared logo source `ohpin_logo...svg`, accessible link name `OhPin · 홈으로`.
- Orca browser `/admin/dashboard`: same logo source and accessible name; rendered logo `56 × 60.42` inside the `84px` brand row with no horizontal overflow.
- Orca browser `/join/NOPE`: participant empty state exposes the same shared OhPin logo and accessible link name.
- Responsive checks: no horizontal overflow at `600 × 800`; no horizontal overflow at `536 × 419`, the effective CSS viewport for approximately 200% zoom from the original `1071 × 838` desktop viewport.
- Image load check: intrinsic `557 × 601`, rendered `52 × 56.10`, complete with the supplied aspect ratio preserved.
- Browser console: no application warnings or errors; only React development tooling notices.
- Ponytail review: removed the unused `compact`, `product`, and `label` logo props and legacy selectors; final task diff has no remaining over-engineering finding (`Lean already. Ship.`).
- Document gate: manifest, Direct-Strict baseline governance, context lock, context pack, and final traceability verification all passed for `ohpin-visible-branding`.
