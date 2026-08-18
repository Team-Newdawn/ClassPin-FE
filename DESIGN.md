---
version: alpha
name: Pin Design System
description: Clear Spatial Intelligence — Pin 관리자 웹(B2B SaaS)의 시각 결정 기준. v1.0 (2026.07.14)
colors:
  # Primitive — Brand Blue (화면에서 직접 참조 금지, semantic 토큰 경유)
  blue-50: "#EFF6FF"
  blue-100: "#DBEAFE"
  blue-200: "#BFDBFE"
  blue-300: "#93C5FD"
  blue-400: "#60A5FA"
  blue-500: "#3478F6"
  blue-600: "#2867E8"
  blue-700: "#2054C8"
  blue-800: "#1E46A2"
  blue-900: "#1E3A75"
  # Primitive — Neutral
  neutral-0: "#FFFFFF"
  neutral-50: "#F8FAFC"
  neutral-100: "#F1F5F9"
  neutral-200: "#E5EAF0"
  neutral-300: "#D1D8E0"
  neutral-400: "#A9B2BE"
  neutral-500: "#7C8796"
  neutral-600: "#5E6978"
  neutral-700: "#3D4754"
  neutral-800: "#252D38"
  neutral-900: "#171D26"
  neutral-950: "#101827"
  # Semantic (원본 CSS 변수의 var() 체인을 hex로 해석한 값)
  brand: "#2867E8"            # = blue-600
  brand-hover: "#2054C8"      # = blue-700
  brand-subtle: "#EFF6FF"     # = blue-50
  text-primary: "#171D26"     # = neutral-900
  text-secondary: "#5E6978"   # = neutral-600
  text-tertiary: "#7C8796"    # = neutral-500
  bg-page: "#F8FAFC"          # = neutral-50
  bg-surface: "#FFFFFF"       # = neutral-0
  border: "#E5EAF0"           # = neutral-200
  border-strong: "#D1D8E0"    # = neutral-300
  success: "#0E9F6E"
  success-bg: "#ECFDF5"
  warning: "#D97706"
  warning-bg: "#FFF7ED"
  error: "#E5484D"
  error-bg: "#FFF1F2"
  info: "#3478F6"
  info-bg: "#EFF6FF"
  pending: "#7C3AED"
  pending-bg: "#F5F3FF"
  # Visualization 전용 (일반 UI semantic과 분리 관리)
  viz-cat-facility: "#3478F6"
  viz-cat-safety: "#E5484D"
  viz-cat-clean: "#0E9F6E"
  viz-cat-convenience: "#8B5CF6"
  viz-cat-mobility: "#F59E0B"
  viz-cat-etc: "#64748B"
  viz-heat-low: "#DBEAFE"       # = blue-100
  viz-heat-mid: "#93C5FD"       # = blue-300
  viz-heat-high: "#3478F6"      # = blue-500
  viz-heat-critical: "#2054C8"  # = blue-700
typography:
  display:
    fontFamily: Pretendard
    fontSize: 32px
    fontWeight: 700
    lineHeight: 42px
    letterSpacing: "-0.02em"
  h1:
    fontFamily: Pretendard
    fontSize: 28px
    fontWeight: 700
    lineHeight: 38px
    letterSpacing: "-0.02em"
  h2:
    fontFamily: Pretendard
    fontSize: 22px
    fontWeight: 700
    lineHeight: 32px
    letterSpacing: "-0.01em"
  h3:
    fontFamily: Pretendard
    fontSize: 18px
    fontWeight: 600
    lineHeight: 28px
  title:
    fontFamily: Pretendard
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
  body-lg:
    fontFamily: Pretendard
    fontSize: 16px
    fontWeight: 400
    lineHeight: 26px
  body-md:
    fontFamily: Pretendard
    fontSize: 14px
    fontWeight: 400
    lineHeight: 22px
  body-sm:
    fontFamily: Pretendard
    fontSize: 13px
    fontWeight: 400
    lineHeight: 20px
  caption:
    fontFamily: Pretendard
    fontSize: 12px
    fontWeight: 500
    lineHeight: 18px
  label:
    fontFamily: Pretendard
    fontSize: 13px
    fontWeight: 600
    lineHeight: 18px
rounded:
  xs: 6px
  sm: 8px
  md: 10px
  lg: 12px
  xl: 16px
  "2xl": 20px
  full: 999px
spacing:
  "4": 4px
  "8": 8px
  "12": 12px
  "16": 16px
  "20": 20px
  "24": 24px
  "32": 32px
  "40": 40px
  "48": 48px
  "64": 64px
  sidebar-width: 248px
  sidebar-collapsed: 72px
  topbar-height: 64px
  content-max-width: 1440px
  section-gap: 32px
  card-padding: 24px
  card-padding-compact: 20px
  grid-gap: 16px
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-secondary-hover:
    backgroundColor: "{colors.neutral-50}"
    borderColor: "{colors.neutral-400}"
  button-tertiary:
    textColor: "{colors.blue-700}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-tertiary-hover:
    backgroundColor: "{colors.brand-subtle}"
  button-destructive:
    backgroundColor: "{colors.error}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
    height: 40px
    padding: 16px
  button-destructive-hover:
    backgroundColor: "#C93A3F"
  button-disabled:
    backgroundColor: "{colors.neutral-100}"
    textColor: "{colors.neutral-400}"
  button-sm:
    height: 32px
    padding: 12px
  button-lg:
    height: 48px
    padding: 20px
  card:
    backgroundColor: "{colors.bg-surface}"
    borderColor: "{colors.border}"
    rounded: "{rounded.xl}"
    padding: 24px
  card-hover:
    borderColor: "{colors.border-strong}"
  card-selected:
    backgroundColor: "{colors.brand-subtle}"
    borderColor: "{colors.blue-500}"
  input:
    backgroundColor: "{colors.bg-surface}"
    textColor: "{colors.text-primary}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.md}"
    height: 44px
    padding: 14px
  input-focus:
    borderColor: "{colors.blue-500}"
  input-error:
    borderColor: "{colors.error}"
  badge:
    backgroundColor: "{colors.neutral-100}"
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.full}"
    height: 24px
    padding: 10px
  nav-item:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    height: 40px
    padding: 12px
  nav-item-hover:
    backgroundColor: "{colors.neutral-100}"
    textColor: "{colors.text-primary}"
  nav-item-active:
    backgroundColor: "{colors.brand-subtle}"
    textColor: "{colors.blue-700}"
  table-header:
    backgroundColor: "{colors.neutral-50}"
    textColor: "{colors.text-secondary}"
    height: 44px
  table-row:
    height: 52px
  modal:
    rounded: "{rounded.2xl}"
---

# Pin Design System

> 원본: `Pin_디자인시스템_정의서_v1.0.html` (v1.0 · 2026.07.14 · 근거 문서: 01_DESIGN_SYSTEM_SPEC.md, 02_CLAUDE_DESIGN_MASTER_PROMPT.md). 브랜드명은 Taglow → Pin으로 통일. Elevation shadow 값은 정의서에서 확정된 값.

## Project brief (Weak Harness)

Pin Class는 강사가 여러 강의 자료를 폴더로 정리하고, 각 자료를 실시간 발표하며,
수강생이 슬라이드의 정확한 위치에 남긴 질문을 처리하는 웹 앱이다. 첫 화면은 제품
소개나 업로드가 아니라 Google 로그인이다. 인증 후의 첫 정보 구조는 **폴더 -> 강의
자료 -> 라이브 플레이어**이며, 인사이트는 자료 목록과 같은 페이지의 탭으로 접근한다.

### Primary journey

1. `/` 진입 시 미인증 사용자는 `/login`, 인증된 강사는 `/admin/dashboard`로 이동한다.
2. 대시보드는 폴더 카드와 폴더 이름 검색을 우선 노출한다. 폴더 카드에는 대표 썸네일,
   자료 수, 질문 수, 최근 갱신 정보를 보여주고 카드 전체를 클릭 대상으로 사용한다.
3. `/admin/folders/[id]`는 폴더 이름과 뒤로가기, `자료 | 인사이트` 탭, 검색, 업로드,
   grid/list 보기 전환을 제공한다. 인사이트 안에서는 chip으로 폴더 전체와 개별 자료
   범위를 바꾼다. 이 화면에는 영구 사이드바를 두지 않는다.
4. 자료를 열면 `/admin/session/[id]` 라이브 워크스페이스로 이동한다. 왼쪽 폴더 레일은
   접을 수 있고, 가운데는 슬라이드/필름스트립/발표 메모, 오른쪽은 폭 조절 가능한
   실시간 질문 패널이다.

### Live workspace geometry

```text
+----------------------+--------------------------------+----------------------+
| collapsible folder   | slide stage                    | resizable questions  |
| rail                 | visible horizontal filmstrip  | min 300 / max 560px  |
| 240px or 56px        | speaker notes below slide     |                      |
+----------------------+--------------------------------+----------------------+
```

- 상단 상태는 점만으로 의미를 전달하지 않는다. `LIVE`/`STOPPED` 텍스트와 고대비 상태
  배지, 시작/종료 동작을 함께 제공한다.
- 오른쪽 패널 폭은 CSS custom property와 native Pointer Events로 조절하고, 최소/최대
  값을 제한한다. 900px 초과 화면에서는 stage를 최소 400px 남기고 패널 최대폭을
  가용 공간에 맞춰 줄인다. 별도 resize 패키지를 추가하지 않는다.
- 슬라이드 필름스트립은 `overflow-x: auto`와 항상 보이는 스크롤바를 사용한다.
- 필름스트립의 현재 슬라이드는 error-red 테두리로 다른 썸네일과 구분한다.
- 문서 레벨 `ArrowLeft`/`ArrowRight`는 슬라이드를 이동하지만 input, textarea, select,
  contenteditable, dialog 안의 조작이나 Alt/Ctrl/Cmd 조합키를 가로채지 않는다.
- 발표 메모는 현재 슬라이드 아래에 두고 native 세로 resize를 허용하며, 수강생 데이터
  경로에는 절대 포함하지 않는다.
- 질문 패널 폭이 바뀌어도 stage toolbar는 최소 높이를 유지한다. 제목/동기화 문구는
  줄임표로 줄일 수 있지만 슬라이드나 상단 액션과 겹치지 않는다.

### Folder model

- 폴더는 소유 강사에 귀속되며 이름은 trim된 1–80자다.
- 한 강의 자료는 폴더 하나에 속하거나 미분류 상태일 수 있다. 폴더 삭제 시 강의 자료를
  삭제하지 않고 미분류로 돌린다.
- DB는 기존 `session_folders` 소유권/RLS를 재사용하고, 기존 `owner_id`와 직접 복합
  소유권 FK를 구성할 수 있는 `courses.folder_id`만 추가한다.
  UI와 저장소에서는 Pin Class 타입을 사용해 `/pin` 캠페인 모델과 결합하지 않는다.
- demo 모드도 같은 동작을 제공하되 localStorage에만 저장한다.

### Local Supabase

- 로컬 기능 개발과 마이그레이션 검증은 Supabase CLI가 Docker로 띄우는 Postgres 17,
  Auth, Storage, Realtime, Studio를 사용한다. 원격 운영 DB에서 개발하지 않는다.
- Google OAuth의 로컬 콜백은 `http://127.0.0.1:55321/auth/v1/callback`이고, 앱 콜백은
  `http://localhost:3000/auth/callback`이다.
- Google Client ID/Secret은 루트 `.env`에서 `config.toml`의 `env()`로 주입한다.
  service-role/secret key는 브라우저용 `NEXT_PUBLIC_*` 변수에 넣지 않는다.
- 새 migration은 `supabase migration new <name>`으로 만든 뒤, `supabase db reset
  --local`이 처음부터 끝까지 성공하는 것으로 재현성을 증명한다.

### Responsive behavior

- 1180px 아래에서는 라이브 폴더 레일을 기본 접힘 상태로 만들 수 있지만 사용자가 다시
  열 수 있어야 한다.
- 900px 아래에서는 자료 grid를 1열로 줄이고, 목록의 부가 통계를 줄여도 핵심 제목과
  상태는 유지한다.
- 오른쪽 질문 패널은 작은 화면에서 전체 폭 하단 영역으로 흐르게 하며 resize handle은
  숨긴다. 기능을 숨기지 않는다.

## Overview

**컨셉: Clear Spatial Intelligence.** Pin은 데이터를 많이 보여주는 서비스가 아니라, 어디에서 어떤 문제가 발생했으며 무엇부터 처리해야 하는지 이해시키는 서비스다. 학교·기업·공공기관이 사용하는 Desktop-first B2B SaaS 관리자 웹이며, 서체는 Pretendard, 접근성 기준은 WCAG 대비 4.5:1이다.

브랜드 원칙 5가지:

- **Clear** — 한 화면의 목적과 우선순위가 즉시 보인다.
- **Reliable** — 학교·기업·공공기관이 사용해도 안정적이고 신뢰감 있다.
- **Actionable** — 데이터는 항상 다음 행동과 연결된다.
- **Calm** — 장식, 과한 그림자, 불필요한 애니메이션을 줄인다.
- **Consistent** — 새 표현보다 기존 토큰과 컴포넌트 재사용을 우선한다.

**토큰 아키텍처 (3계층).** 모든 색·크기 값은 Primitive → Semantic → Component 3계층을 거쳐 사용한다. 화면 코드에 직접 hex를 작성하는 것은 금지된다.

1. **Primitive** (`--pin-blue-600: #2867E8`) — 원시 팔레트. 브랜드 blue 10단계, neutral 12단계. 화면에서 직접 참조하지 않는다.
2. **Semantic** (`--color-brand: var(--pin-blue-600)`) — 역할 기반 토큰. brand, text-primary, border, success 등 의미로 참조한다.
3. **Component** (`.btn-primary { background: var(--color-brand) }`) — 버튼·카드·입력 등 컴포넌트 클래스가 semantic 토큰만 소비한다.

## Colors

강한 Accent는 한 화면에 Brand blue 하나가 기본. 상태는 색만으로 구분하지 않고 항상 **label + icon + color** 세 요소를 함께 사용한다.

**Brand — Pin Blue (10단계)**

| 토큰 | Hex | 용도 |
|---|---|---|
| blue-50 | #EFF6FF | 선택 배경 |
| blue-100 | #DBEAFE | 약한 강조 |
| blue-200 | #BFDBFE | 강조 border |
| blue-300 | #93C5FD | 보조 데이터 |
| blue-400 | #60A5FA | 차트 |
| blue-500 | #3478F6 | Brand |
| blue-600 | #2867E8 | Primary action |
| blue-700 | #2054C8 | Hover / Pressed |
| blue-800 | #1E46A2 | Strong emphasis |
| blue-900 | #1E3A75 | Dark brand |

**Neutral (12단계)**

| 토큰 | Hex | 용도 |
|---|---|---|
| neutral-0 | #FFFFFF | Surface |
| neutral-50 | #F8FAFC | Page 배경 |
| neutral-100 | #F1F5F9 | Hover 배경 |
| neutral-200 | #E5EAF0 | 기본 border |
| neutral-300 | #D1D8E0 | 강한 border |
| neutral-400 | #A9B2BE | Placeholder |
| neutral-500 | #7C8796 | Tertiary text |
| neutral-600 | #5E6978 | Secondary text |
| neutral-700 | #3D4754 | 강조 본문 |
| neutral-800 | #252D38 | Strong label |
| neutral-900 | #171D26 | Primary text |
| neutral-950 | #101827 | 최심도 · overlay |

**Semantic 상태 컬러 (FG / BG 페어)**

| 상태 | FG | BG |
|---|---|---|
| Success | #0E9F6E | #ECFDF5 |
| Warning | #D97706 | #FFF7ED |
| Error | #E5484D | #FFF1F2 |
| Information | #3478F6 | #EFF6FF |
| Pending | #7C3AED | #F5F3FF |

텍스트 선택(`::selection`) 배경은 blue-100.

## Typography

폰트 스택: `Pretendard Variable, Pretendard, Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`. 기본 본문은 14px.

| 레벨 | 크기/행간 | Weight | Letter-spacing | 용도 |
|---|---|---|---|---|
| Display | 32 / 42 | 700 | -0.02em | 핵심 결과 · 대형 KPI |
| H1 | 28 / 38 | 700 | -0.02em | 페이지 제목 |
| H2 | 22 / 32 | 700 | -0.01em | 주요 섹션 |
| H3 | 18 / 28 | 600 | — | 카드 제목 |
| Title | 16 / 24 | 600 | — | 리스트 · 탭 |
| Body L | 16 / 26 | 400 | — | 긴 설명 |
| Body | 14 / 22 | 400 | — | 기본 UI 텍스트 |
| Body S | 13 / 20 | 400 | — | 메타 정보 |
| Caption | 12 / 18 | 500 | — | 날짜 · 보조 정보 |
| Label | 13 / 18 | 600 | — | Form label |

Type scale은 이 10종만 사용한다(12 / 13 / 14 / 16 / 18 / 22 / 28 / 32px). Weight는 400 / 500 / 600 / 700 네 단계만. KPI 숫자에는 `font-variant-numeric: tabular-nums`를 적용한다.

## Layout

Pin은 Desktop-first responsive web application이며 App Shell 구조를 따른다.

- **Sidebar**: 고정 248px (축소 시 72px), 좌측 고정, 우측 1px border. 항목 높이 40px.
- **Top bar**: 높이 64px, sticky, 하단 1px border. 배경 `rgba(255,255,255,.92)` + `backdrop-filter: blur(8px)`.
- **Content**: 최대 폭 1440px, 중앙 정렬, padding 24–40px(기본 32px), 섹션 간격 32px.
- **Page header**: 제목 · 설명 · Primary action 고정 구조.

**Spacing scale (10단계)** — 4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64px

| 값 | 용도 |
|---|---|
| 4px | 아이콘–텍스트 최소 간격 |
| 8px | 칩 · 배지 사이 |
| 12px | 버튼 그룹 간격 |
| 16px | 카드 grid gap |
| 20px | 입력 필드 간격 · Compact 카드 padding |
| 24px | 기본 카드 padding · Page header–첫 콘텐츠 |
| 32px | 섹션 간격 · 기본 page padding |
| 40px | 대형 화면 page padding |
| 48px | 대형 섹션 구분 |
| 64px | 페이지 최상위 여백 |

**Breakpoints & 반응형 원칙**

| 구간 | 범위 | Sidebar | 주요 변화 |
|---|---|---|---|
| xl | 1440px ~ | 고정 248px | KPI grid 4열 · page padding 40px |
| lg | 1024–1439 | 고정 248px | Content 가변 · 지도 상세는 Drawer |
| md | 768–1023 | 축소 72px 또는 overlay | KPI grid 2열 |
| sm | 0–767 | Navigation drawer | 테이블 → 카드 리스트 · 지도 상세 Bottom sheet · KPI 1열 |

## Elevation & Depth

기본 카드는 shadow 없이 **1px border**(neutral-200)만 사용한다. Primary button glow는 금지. 시각적 위계는 border와 배경 대비로 우선 표현하고, shadow는 떠 있는 레이어에만 부여한다.

| 단계 | 값 | 용도 |
|---|---|---|
| Border only | 1px neutral-200 | 일반 카드 |
| shadow-xs | 0 1px 2px rgba(16,24,39,.06) | Hover card |
| shadow-sm | 0 2px 8px rgba(16,24,39,.08) | Dropdown |
| shadow-md | 0 6px 16px rgba(16,24,39,.10) | Drawer |
| shadow-lg | 0 12px 32px rgba(16,24,39,.14) | Modal |

## Shapes

Radius 7단계. 표면이 클수록 큰 radius를 쓴다.

| 토큰 | 값 | 용도 |
|---|---|---|
| xs | 6px | 작은 badge |
| sm | 8px | 작은 control |
| md | 10px | input · button |
| lg | 12px | popover |
| xl | 16px | card · panel |
| 2xl | 20px | modal |
| full | 999px | pill · toggle |

## Components

모든 인터랙티브 요소는 hover · active · focus-visible · disabled 상태를 갖는다. **Focus ring은 `0 0 0 3px rgba(52,120,246,.14)`** (box-shadow, outline 제거)를 모든 인터랙티브 요소에 공통 적용한다. Hover 전환은 140ms.

### Button

- Variants: Primary(brand 배경 + 흰 텍스트), Secondary(surface 배경 + border-strong 테두리), Tertiary(투명 배경 + blue-700 텍스트), Destructive(error 배경 + 흰 텍스트), Disabled(neutral-100 배경 + neutral-400 텍스트).
- Sizes: Small 32px(padding 0 12px, 13px), Medium 40px(padding 0 16px, 14px), Large 48px(padding 0 20px, 16px). Weight 600, radius md(10px).
- Primary action은 한 페이지 영역당 하나. glow shadow 금지. 완료·런칭 의미라도 action은 Primary blue(성공 green 금지).

### Card

- White surface · 1px neutral-200 border · radius 16px · padding 24px(Compact 20px).
- Hover 카드: border-strong 강조 + shadow-xs. Selected 카드: blue-50 배경 + blue-500 border.
- 전체 클릭형 카드에 중복 "상세보기" CTA 금지.

### Form / Input

- Input 높이 44px · radius 10px · 좌우 padding 14px · placeholder는 neutral-400.
- Focus: border blue-500 + focus ring. Error: border error + 하단 12px error 메시지. Hint는 text-tertiary 12px.
- Label(13px/600)은 필수 — placeholder가 label을 대체하지 않는다.

### Table

- Header 높이 44px(neutral-50 배경, 13px/600 secondary 텍스트), Row 높이 52px, 행 구분 1px border.
- 텍스트는 왼쪽, 숫자는 오른쪽 정렬(tabular-nums). 상태는 badge로 표시.
- 노출 action은 하나, 나머지는 overflow menu.

### Badge

높이 24px · padding 0 10px · radius full · 12px/600. 기본은 neutral-100 배경 + secondary 텍스트, 상태별로 semantic BG/FG 페어 사용(brand/success/warning/error/info/pending). 앞에 6px dot 배치 가능.

### Navigation (Sidebar)

- Item 높이 40px · icon 18px · icon–텍스트 gap 10px · radius md.
- 기본: secondary 텍스트. Hover: neutral-100 배경 + primary 텍스트. **Active: blue-50 배경 + blue-700 텍스트 + weight 600.**

### Drawer / Modal

단순 상세 조회는 Drawer, 중대한 결정은 Modal. header/footer는 sticky.

| 용도 | 폭 | Elevation |
|---|---|---|
| Drawer — 지도 상세 · 피드백 조회 | 400–480px | shadow-md |
| Modal — 확인 · 폼 · 위저드 | 400 / 560 / 720px | shadow-lg (radius 2xl) |

## 지도 · 데이터 시각화

지도 색상은 일반 UI semantic color와 분리된 **visualization 토큰**(`viz-*`)으로 관리한다. 화면 우선순위: Map data → 현재 선택 → 필터/뷰 모드 → 상세 응답 → 보조 유틸리티.

**Bubble**

- 크기 36–112px(최소 36, 최대 112), 배경 opacity 76–88% (예: 36px `rgba(52,120,246,.82)`, 84px `.86`, 112px `.88`).
- 내부 숫자는 흰색 · weight 700 · tabular-nums · 대비 4.5:1 이상.
- **선택 표현은 크기 변화가 아니라 ring**: `0 0 0 2px bg-surface, 0 0 0 4px blue-600` + z-index 상승.

**Heatmap** — Brand blue 단일 scale 4단계: Low = blue-100(#DBEAFE), Medium = blue-300(#93C5FD), High = blue-500(#3478F6), Critical = blue-700(#2054C8).

**Category — Visualization 전용 6색**

| 카테고리 | Hex |
|---|---|
| 시설 (facility) | #3478F6 |
| 안전 (safety) | #E5484D |
| 청결 (clean) | #0E9F6E |
| 편의 (convenience) | #8B5CF6 |
| 이동 (mobility) | #F59E0B |
| 기타 (etc) | #64748B |

동일 데이터 계열은 단일 색상 scale, 여러 카테고리는 최대 5색까지. Legend는 항상 접근 가능해야 한다.

## 상태 모델

각 상태는 label + icon + semantic color 세 요소를 항상 함께 사용한다(badge 컴포넌트로 표현).

- **Project 라이프사이클**: Draft(neutral) → Scheduled(pending) → Live(brand) → Paused(warning) → Closed(success) → Archived(neutral)
- **Feedback 처리 흐름**: New(info) → Reviewing(pending) → In Progress(warning) → Resolved(success), 또는 Rejected(error)

## 모션

Easing은 `cubic-bezier(0.2, 0, 0, 1)` 하나로 통일한다. 데이터가 바뀔 때만 짧은 opacity/position transition을 사용한다.

| 대상 | Duration | 토큰값 |
|---|---|---|
| Hover | 120–160ms | 140ms |
| Dropdown | 160ms | 160ms |
| Modal | 200ms | 200ms |
| Drawer | 240ms | 240ms |

금지: 카드가 위로 크게 튀는 효과, 버튼 scale 효과, 지속적인 장식 애니메이션(drifting · breathing). `prefers-reduced-motion` 지원 필수.

## 접근성

- 본문 텍스트 대비 4.5:1 이상 (WCAG AA)
- Pointer target 최소 40×40px, 모바일 44×44px
- Keyboard focus visible 필수 — 모든 인터랙티브 요소에 focus ring
- Icon-only 버튼에 `aria-label`과 tooltip 제공
- 지도 정보는 리스트/테이블로도 접근 가능해야 함
- 200% zoom에서 핵심 작업 수행 가능
- `prefers-reduced-motion` 지원

## Do's and Don'ts

- Do: 한 화면의 강한 Accent는 Brand blue 하나를 기본으로 유지
- Do: 상태 표현에 아이콘·텍스트를 색과 함께 사용
- Do: Semantic 토큰(`--color-brand` 등)으로만 색 참조
- Do: 성공 컬러는 완료 상태 표시에만 사용
- Do: Type scale 10종 · Weight 4단계(400/500/600/700)만 사용
- Do: KPI 숫자에 tabular-nums 적용
- Don't: 화면 코드에 직접 hex 값 작성
- Don't: 색상만으로 상태 구분 (색각 이상 대응 불가)
- Don't: 주요 CTA에 성공(green) 컬러 사용 — 완료 의미라도 action은 Primary blue
- Don't: 서로 비슷한 blue 값 임의 추가 — scale 밖 값 금지
- Don't: 12px 미만 텍스트, 반 단위(10.5/11.5/13.5px) 크기
- Don't: 한 화면에서 700 weight 남발 — 페이지 제목과 핵심 수치에 제한
- Don't: 기본 카드에 shadow, Primary button에 glow
- Don't: 선택 시 bubble 확대 — ring과 layer 우선순위로 표현
