# Zoom 플러그인(Zoom Apps) 연동 시험 기록

- 작성: 2026-10-24
- 상태: 시험 완료, 코드 미반영. 시험용 하위 워크스페이스 `zoom-app`은 삭제했고, 다시 만들 때 필요한 코드는 부록에 모두 남겼다.
- 목적: OhPin 학생 참여 화면을 Zoom 회의 안에서 열 수 있는지 확인한다.

## 1. 왜 Zoom부터 했나

화상회의 4종(Zoom, Google Meet, Microsoft Teams, Webex)은 모두 외부 웹앱을 회의 화면 안에 띄우는 공식 기능이 있다. OhPin은 이미 웹앱이라 새로 만들 필요는 없고, 각 서비스의 규칙에 맞게 감싸기만 하면 된다.

| 항목 | Zoom | Google Meet | Teams | Webex |
|---|---|---|---|---|
| 기능 이름 | Zoom Apps | Meet Add-ons | Meeting Apps | Embedded Apps |
| 학생이 로그인 없이 참여 | 가능 (Guest Mode) | 불가 (Google 로그인 필수, 18세 미만 불가) | 가능 (설정 필요) | 확인 못 함 |
| 내부용 배포 | 심사 없음 | 심사 없음 | 관리자 업로드 | 관리자 승인 |

**Zoom을 먼저 고른 이유**
- 로그인하지 않은 학생도 쓸 수 있다(Guest Mode).
- 참여하지 못한 사람에게는 화면 공유가 대신 보인다.
- private 앱은 심사 없이 바로 시험할 수 있다.

## 2. 결정한 구조

```
┌──────── 학생의 Zoom 화면 ────────┬─ 오른쪽 사이드 패널 (넓게 모드) ─┐
│ 강사가 화면 공유한 OhPin 발표 창  │ OhPin 참여자 화면 (/zoom → /join) │
└──────────────────────────────────┴──────────────────────────────────┘
```

- **강사:** 지금처럼 일반 크롬에서 로그인하고, 발표 창을 Zoom 화면 공유로 보여준다. 강사 화면을 Zoom 앱 안에 넣지 않은 이유는 두 가지다.
  - Zoom 앱 내장 브라우저에서는 Google 로그인으로 이동하면 보안 헤더 검사에 걸려 실패한다.
  - 강의 관리 화면은 강사만 봐야 한다.
- **학생:** Zoom 앱(OhPin)이 `/zoom`을 연다. 학생이 발표 화면의 QR 아래 참여 코드를 입력하면 기존 참여자 화면 `/join/{code}`로 넘어간다.
- **사이드 패널 크기:** 기본 폭이 약 320px로 좁아서, 열릴 때 `expandApp`으로 넓게 모드로 바꾼다. 휴대폰처럼 넓게 모드가 없는 환경에서는 실패해도 무시한다.
- **초대:** 회의 호스트나 공동 호스트에게만 "참가자 전체 초대" 버튼을 보여준다. 역할은 `getUserContext`로 확인하고, 초대는 `sendAppInvitationToAllParticipants`로 보낸다. 이 버튼 숨김은 화면 정리용이고 보안 장치가 아니다. 학생이 눌러도 같은 OhPin 앱이 열릴 뿐이다.
- **보안 경계:** Zoom 안에 열리는 것은 원래 공개된 학생 참여 화면뿐이다. 강사 인증, 백엔드, DB는 바꾸지 않는다.

### 하지 않은 것

| 항목 | 이유 |
|---|---|
| 몰입 모드(회의 화면 전체 사용) | 호스트만 켤 수 있고, 강사 영상 배치까지 직접 만들어야 해서 비용이 크다 |
| Collaborate 모드 | 이번 시험 범위 밖 |
| Zoom 회의와 강의 자동 연결 | 백엔드 변경이 필요해서, 이번에는 코드 직접 입력으로 대신했다 |

## 3. 코드 변경 (부록 A에 전체 코드)

| 파일 | 내용 |
|---|---|
| `app/(view)/zoom/page.tsx`, `page.module.css` | 공개 진입 페이지. 코드를 입력하면 `/join/{code}`로 이동한다. Zoom 안에서는 넓게 모드로 바꾸고, 호스트에게 초대 버튼을 보여준다 |
| `next.config.ts` | `/zoom`, `/join/*`에 OWASP 헤더 4종 추가. 개발 서버에 터널 도메인 허용 |
| `app/_model/i18n.ts` | `zoom.*` 문구 5개 (한국어/영어) |
| `package.json` | `@zoom/appssdk` 0.16.42 (MIT) |

## 4. Zoom Marketplace 설정

앱은 Marketplace의 **General App**으로 만들었다. 설정은 화면에서 직접 입력하는 대신 **manifest(JSON)**를 쓴다.

1. 앱 페이지에서 **Manage manifest → 다운로드**로 현재 manifest를 받는다.
2. 받은 파일을 고친다(부록 B).
3. **Upload new manifest**로 올린다.

**Manifest를 쓰는 이유**
- Zoom 공식 문서에는 manifest의 바깥 구조만 나와 있다. 내려받은 파일을 고치는 쪽이 안전하다.
- Zoom MCP와 공식 Claude 플러그인은 앱 설정 기능이 없다.
- Marketplace API로 설정하려면, 권한 토큰을 받을 별도 앱을 하나 더 만들어야 한다.

| 항목 | 값 |
|---|---|
| 관리 방식 | **User-managed** (Admin-managed에서는 SDK와 Guest Mode 메뉴가 나오지 않는다) |
| products | `ZOOM_MEETING` |
| Home URL, OAuth Redirect URL | `https://<도메인>/zoom` |
| OAuth Allow List | `https://<도메인>` |
| Domain Allow List | `<도메인>`, `epsdbkwcxzlvqowmgaed.supabase.co`, `appssdk.zoom.us` |
| Zoom App SDK APIs | `expandApp`, `getUserContext`, `sendAppInvitationToAllParticipants` |
| Guest Mode | 켬 (`enable_test_guest_mode` 포함) |
| Mobile | 켬 (iOS/iPadOS는 Apple Developer Team ID가 추가로 필요하고, 화면에서 직접 입력해야 한다) |
| Scope | `zoomapp:inmeeting` |

설정을 바꾼 뒤에는 **Local Test → Add App Now**로 다시 설치하고, Zoom을 Cmd+Q로 완전히 종료했다가 다시 켠다.

## 5. 로컬 시험 방법

Zoom은 HTTPS 주소만 받기 때문에 로컬 서버를 터널로 연다.

1. 앱 워크스페이스에서 `npm run dev:remote`를 실행한다(포트 3000).
   - 원격 Supabase와 원격 백엔드를 쓴다.
   - 로컬 Supabase(`http://127.0.0.1`)는 Zoom의 HTTPS 화면에서 불러올 수 없다.
   - 실제 서비스 데이터에 쓰기 때문에, 시험용 강의로 수업이 없는 시간에 한다.
2. `cloudflared tunnel --url http://127.0.0.1:3000`을 실행한다.
   - 주소는 `https://<임의>.trycloudflare.com` 형태다.
   - 켤 때마다 주소가 바뀌므로 manifest를 다시 올려야 한다.
   - 이 주소는 인터넷 누구나 접속할 수 있다. 시험이 끝나면 바로 닫는다.
3. manifest의 `<도메인>` 자리에 터널 주소를 넣어 올리고, Local Test로 설치한다.
4. 강사는 크롬에서 강의를 LIVE로 시작하고 발표 창을 Zoom으로 화면 공유한다. 학생은 Zoom의 **앱 → OhPin**을 열고 코드를 입력한다.

### 누가 학생 역할로 시험할 수 있나 (공개 전)

| 학생 역할 | 가능 여부 |
|---|---|
| 본인의 다른 기기나 다른 계정 | 가능 |
| 같은 Zoom 조직의 계정 | Local Test의 Authorization URL로 설치하면 가능 |
| 로그인하지 않았거나 앱이 없는 참가자(게스트) | 그 기기에서 테스트 설정을 켜야 가능 (아래) |
| 다른 계정의 일반 학생 | **배포(unlisted 이상)와 Zoom 심사가 필요** |

게스트 테스트 설정을 켜는 방법:
- Mac: `defaults write ZoomChat enableGuestModeTesting true` 실행 후 Zoom 재시작. 되돌릴 때는 `defaults delete ZoomChat enableGuestModeTesting`.
- Windows: `%appdata%\Zoom\data\Zoom.us.ini` 파일에 `[ZoomChat]`와 `enableGuestModeTesting=true` 두 줄을 추가.
- 휴대폰: 켜는 방법이 공식 문서에 없다.

## 6. 시험 중 생긴 문제와 해결

| 증상 | 원인 | 해결 |
|---|---|---|
| 코드를 입력해도 이동하지 않고 주소가 `/zoom?`로 바뀜 | Next 개발 서버가 처음 보는 주소(터널)의 JS 요청을 403으로 막음. JS가 실행되지 않아 브라우저 기본 form 제출이 일어남 | `allowedDevOrigins`에 `*.trycloudflare.com` 추가 (개발 서버에만 적용) |
| 원격 DB를 쓰지 못함 | 처음에 Supabase 주소를 로컬 터널로 바꿔 띄움 | `npm run dev:remote` 그대로 사용. Domain Allow List에 원격 Supabase 도메인 추가 |
| 휴대폰 Zoom에서 앱이 열리지 않음 | manifest의 Mobile이 꺼져 있었음 | `zoom_client_support.mobile.enable = true` |
| "게스트 모드에서는 이 Zoom App을 사용할 수 없습니다" | 공개 전 앱은 테스트 기기로 지정된 게스트만 쓸 수 있음 | 해당 기기에서 `enableGuestModeTesting` 켜기 |
| 학생에게도 초대 버튼이 보임 | 역할을 확인하지 않았음 | `getUserContext`의 role이 `host`/`coHost`일 때만 표시 |
| **(미해결)** 호스트에게도 초대 버튼이 안 보이고, 콘솔에 `No Permission for this API [80004, app_not_support]` | Zoom이 `getUserContext`, `sendAppInvitationToAllParticipants`를 허락하지 않음(`config().unsupportedApis`에 포함). `expandApp`은 허락됨. manifest의 API 목록이 반영되지 않은 것으로 보인다 | 다음 시험 때 확인: **Features → Surface → Zoom App SDK → Add APIs**에서 두 API를 직접 체크하고 저장한 뒤 Add App Now로 재설치하고 Zoom 재시작. 그래도 안 되면 Domain Allow List의 "requires review" 경고를 확인한다 ([포럼 사례](https://devforum.zoom.us/t/getusercontext-fails-with-80004-app-not-support-for-actual-meeting-host/146407)) |

**진단 팁:** 원인을 찾을 때 `config()`의 응답(`runningContext`, `unsupportedApis`)과 `getUserContext()`의 응답(`role`, `status`)을 화면에 잠깐 찍어보면 빠르다. Zoom 내장 브라우저에는 기본적으로 개발자 도구가 없다.

## 7. 실제 서비스에 적용하려면

1. 부록 A 코드를 브랜치에 다시 넣는다. 실제 배포에는 `allowedDevOrigins` 변경이 필요 없다.
2. lint와 build를 돌리고 PR을 만든다. `dev`에 merge되면 EC2에 자동 배포된다.
3. manifest의 `<도메인>`을 `ohpin.newdawn.co.kr`로 바꿔 올린다.
4. 6절의 미해결 문제(80004)를 해결한다.
5. 다른 계정의 학생도 쓰게 하려면 unlisted로 배포하고 Zoom 심사를 받는다.
   - 기능 심사 약 72시간, 보안 심사 최대 2주 (포럼 기준)
   - 터널 주소로는 심사를 받을 수 없다.

## 8. 정리 상태 (2026-10-24)

- 하위 워크스페이스 `zoom-app`은 삭제했고, 코드는 이 문서 부록에만 남아 있다.
- cloudflared 터널은 닫았다. Zoom Marketplace 앱은 닫힌 터널 주소를 가리키고 있어서, 다시 쓸 때 manifest를 새로 올려야 한다.
- 이 Mac의 `enableGuestModeTesting` 설정은 켜진 상태로 남아 있다.

## 참고 자료

- Zoom: [Zoom Apps 개요](https://developers.zoom.us/docs/zoom-apps/) · [빠른 시작 가이드](https://developers.zoom.us/docs/build-flow/quick-start-guide/) · [Surface 설정](https://developers.zoom.us/docs/build-flow/surface/) · [Manifest](https://developers.zoom.us/docs/build-flow/manifests/) · [OWASP 헤더](https://developers.zoom.us/docs/zoom-apps/security/owasp/) · [Guest Mode](https://developers.zoom.us/docs/zoom-apps/guides/guest-mode/) · [Collaborate Mode](https://developers.zoom.us/docs/zoom-apps/guides/collaborate-mode/) · [Mobile](https://developers.zoom.us/docs/zoom-apps/guides/mobile/) · [SDK 레퍼런스](https://appssdk.zoom.us/classes/ZoomSdk.ZoomSdk.html) · [앱 심사](https://developers.zoom.us/docs/distribute/app-review-process/) · [공식 manifest 예시](https://github.com/zoom/skills/blob/main/skills/rest-api/assets/marketplace-apps/zoom-app.json)
- 다른 서비스: [Google Meet Add-ons](https://developers.google.com/workspace/meet/add-ons/guides/overview) · [Meet Add-on 사용 제약](https://support.google.com/meet/answer/13961388) · [Teams Meeting Stage](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/build-apps-for-teams-meeting-stage) · [Teams 익명 사용자](https://learn.microsoft.com/en-us/microsoftteams/platform/apps-in-teams-meetings/build-apps-for-anonymous-user) · [Webex Embedded Apps](https://developer.webex.com/create/docs/embedded-apps)

---

## 부록 A. 코드

`npm install @zoom/appssdk@0.16.42 --save-exact`

### `app/(view)/zoom/page.tsx`

```tsx
"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/_controller/language-context";
import { PinLogo } from "@/app/component/pin-logo";
import styles from "./page.module.css";

/** Zoom Apps 시작 주소. 사이드 패널을 넓히고, 화면 공유에 보이는 참여 코드로 /join 에 들어간다. */
export default function ZoomEntry() {
  const { t } = useLanguage();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [canInvite, setCanInvite] = useState(false);
  const [invite, setInvite] = useState<"idle" | "sent" | "failed">("idle");

  useEffect(() => {
    // Zoom 밖(일반 브라우저)에서는 config 가 실패하고 코드 입력만 남는다.
    import("@zoom/appssdk").then(async ({ default: zoomSdk }) => {
      await zoomSdk.config({ capabilities: ["expandApp", "getUserContext", "sendAppInvitationToAllParticipants"] });
      zoomSdk.expandApp({ action: "expand" }).catch(() => undefined);
      // 초대는 강사(호스트·공동 호스트)에게만 보인다.
      const { role } = await zoomSdk.getUserContext();
      setCanInvite(role === "host" || role === "coHost");
    }).catch(() => undefined);
  }, []);

  const join = (event: FormEvent) => {
    event.preventDefault();
    const value = code.trim();
    if (value) router.push(`/join/${encodeURIComponent(value)}`);
  };
  const inviteAll = () => import("@zoom/appssdk")
    .then(({ default: zoomSdk }) => zoomSdk.sendAppInvitationToAllParticipants())
    .then(() => setInvite("sent"), () => setInvite("failed"));

  return <main className={styles.root}>
    <PinLogo />
    <form className={styles.form} onSubmit={join}>
      <label htmlFor="zoom-join-code">{t("zoom.codeLabel")}</label>
      <input id="zoom-join-code" value={code} onChange={(event) => setCode(event.target.value)} autoComplete="off" autoCapitalize="characters" required />
      <button type="submit" className="btn primary">{t("zoom.join")}</button>
    </form>
    {canInvite && <button type="button" className="btn secondary" onClick={inviteAll}>{t("zoom.invite")}</button>}
    {invite !== "idle" && <p role="status">{t(invite === "sent" ? "zoom.inviteSent" : "zoom.inviteFailed")}</p>}
  </main>;
}
```

### `app/(view)/zoom/page.module.css`

```css
.root{min-height:100dvh;display:flex;flex-direction:column;justify-content:center;gap:16px;padding:16px;width:100%;max-width:400px;margin-inline:auto;background:var(--color-bg-page);color:var(--color-text-primary)}
.form{display:grid;gap:8px}.form label{font-weight:600}
.form input{min-height:44px;padding:0 12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-bg-surface);color:inherit;font:inherit;letter-spacing:.08em}
.root p{margin:0;font-size:14px;line-height:22px;color:var(--color-text-secondary)}
```

### `next.config.ts` (추가 부분)

```ts
  // 로컬 터널 시험 때만 필요하다. 실제 배포에는 넣지 않는다.
  allowedDevOrigins: ["127.0.0.1", "*.trycloudflare.com"],
  // Zoom Apps 는 이 OWASP 헤더 4종이 없는 HTML 을 렌더링하지 않는다.
  async headers() {
    const headers = [
      { key: "Strict-Transport-Security", value: "max-age=31536000" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'self' https://zoom.us https://*.zoom.us" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    ];
    return [{ source: "/zoom", headers }, { source: "/join/:path*", headers }];
  },
```

### `app/_model/i18n.ts` (`ko`, `en`에 각각 추가)

```ts
  "zoom.codeLabel": "참여 코드",
  "zoom.join": "참여하기",
  "zoom.invite": "참가자 전체 초대",
  "zoom.inviteSent": "참가자에게 초대를 보냈어요.",
  "zoom.inviteFailed": "초대를 보내지 못했어요. Zoom에 로그인했는지 확인해 주세요.",
```

```ts
  "zoom.codeLabel": "Join code",
  "zoom.join": "Join",
  "zoom.invite": "Invite all participants",
  "zoom.inviteSent": "Invitation sent to participants.",
  "zoom.inviteFailed": "Couldn't send the invitation. Make sure you're signed in to Zoom.",
```

## 부록 B. manifest에서 바꾼 부분

내려받은 manifest의 나머지 값은 그대로 두고 아래 값만 바꾼다. `<도메인>`은 터널 주소나 실제 주소로 바꾼다.

```json
{
  "oauth_information": {
    "usage": "USER_OPERATION",
    "development_redirect_uri": "https://<도메인>/zoom",
    "production_redirect_uri": "https://<도메인>/zoom",
    "oauth_allow_list": ["https://<도메인>"],
    "scopes": [{ "scope": "zoomapp:inmeeting", "optional": false }],
    "scope_description": "Open the OhPin participant page in the meeting side panel."
  },
  "features": {
    "products": ["ZOOM_MEETING"],
    "development_home_uri": "https://<도메인>/zoom",
    "production_home_uri": "https://<도메인>/zoom",
    "domain_allow_list": [
      { "domain": "<도메인>", "explanation": "OhPin participant page." },
      { "domain": "epsdbkwcxzlvqowmgaed.supabase.co", "explanation": "OhPin Supabase anonymous session and realtime." },
      { "domain": "appssdk.zoom.us", "explanation": "Zoom Apps SDK." }
    ],
    "in_client_feature": {
      "zoom_app_api": { "enable": true, "zoom_app_apis": ["expandApp", "getUserContext", "sendAppInvitationToAllParticipants"] },
      "guest_mode": { "enable": true, "enable_test_guest_mode": true }
    },
    "zoom_client_support": { "mobile": { "enable": true } }
  }
}
```
