# Pin Feedback 런타임 종료 명세

- Artifact: `pin-feedback-sunset`
- Status: `reviewed`
- Source: `doc/pin_class_prd.md`, `AGENTS.md`, `DESIGN.md`
- Depends on: `class-frontend-architecture`
- Decision boundary: 별도 `/pin` 제품의 route·UI·service·API·전용 test 제거, Pin Class가 사용하는 공유 로직의 이전, legacy campaign DB·Storage 데이터 보존, 삭제 순서·롤백·검증

이 문서는 Pin Feedback의 별도 웹 제품을 저장소에서 제거하되 이미 Pin Class에 흡수된 동작과 과거 데이터를 보존하는 경계를 정의한다. Pin Class의 최종 View·Controller·Service·CSS 구조는 승인된 `class-frontend-architecture`를 따른다. Campaign schema·Storage 데이터를 실제로 폐기하는 결정은 이 문서의 범위가 아니다.

## 1. 목적, 범위와 비목표

- `PFS-001` 별도 Pin Feedback 제품의 모든 진입점을 제거한다: `app/pin/**`, `app/api/pin/**`.
- `PFS-002` Pin 전용 UI와 상태 계층을 제거한다: `components/pin/**`.
- `PFS-003` Pin 전용 model, repository, 통계, CSV, report, reaction과 route 코드를 제거한다: `lib/pin/**`.
- `PFS-004` 사용자 또는 build가 실행할 Pin Feedback runtime code를 남기지 않는다.
- `PFS-005` 이 작업은 campaign DB·Storage 데이터 폐기, 권한 회수, schema 축소, lecture 데이터 재이전을 포함하지 않는다.
- `PFS-006` `/pin`과 Pin Class를 함께 유지하는 compatibility layer, runtime feature flag와 redirect mapping을 만들지 않는다.

## 2. 삭제할 소스와 테스트

다음 경로는 공유 로직 이전과 소비자 정리가 끝난 뒤 삭제한다.

| 경로 | 삭제 범위 |
| --- | --- |
| `app/pin/**` | entry, login, admin, detail, report, presentation, participant, final route와 layout |
| `app/api/pin/**` | Pin Feedback 전용 PDF render API |
| `components/pin/**` | campaign store, shell, navigation, image canvas, locale title, reaction hook |
| `lib/pin/**` | campaign types·repository·stats·report·CSV·route·reaction·image helper와 Pin 전용 test |

- `PFS-010` Pin 전용 구현과 test는 같은 package에서 함께 삭제한다. 구현이 없는 test나 test가 없는 이동된 순수 로직을 남기지 않는다.
- `PFS-011` Pin Class 브랜드 `pin-logo.tsx`는 삭제하지 않고 전역 공유 경로 `app/component`로 이동한다.
- `PFS-012` 공용 icon, auth, language, Realtime, 설문, 문서 변환 기반과 `qrcode.react`는 Pin Class 소비자가 있으므로 유지한다.
- `PFS-013` `app/pin`, `components/pin`, `lib/pin`, `app/api/pin` 디렉터리는 완료 시 존재하지 않아야 한다.

## 3. Pin Class로 이동할 공유 동작

- `PFS-020` `lib/pin/presentation-rotation.ts`와 test는 Class 발표가 사용하므로 `app/_model/class/presentation-rotation.ts`와 대응 test로 이동한다.
- `PFS-021` `praise`, `improve`, `confusing`, `bug`, `idea` legacy 카테고리는 이미 복사된 Class 질문 표시를 위해 Class model에 유지한다.
- `PFS-022` legacy 카테고리 번역은 `pin.category.*`에서 Class 소유 `category.*` key로 이름을 바꾸고 `categoryLabel`이 계속 해석하도록 한다.
- `PFS-023` Class 참여 화면의 `pin.join.markerTitle`은 `student.markerTitle`로 이름을 바꾼다.
- `PFS-024` Class 발표와 참여 화면이 사용하는 pin displacement, feedback bubble, empathy, milestone, reaction과 presentation selector는 의미에 맞는 Class 이름과 module로 이동한다.
- `PFS-025` Pin 전용 `feedbackCategoryLabel`, `feedbackCategoryHint`, `feedbackZoneLabel`은 `LanguageContext`의 public contract와 구현에서 제거한다.
- `PFS-026` 호출자가 없는 `importPinFeedbackMaterials`, `importOwnedFeedbackCampaigns`, 관련 번역과 repository row type을 제거한다.
- `PFS-027` 공유 로직을 페이지별로 복사하지 않는다. 이동된 순수 로직과 CSS는 `class-frontend-architecture`의 model·component 소유권을 따른다.

## 4. CSS, 번역과 dependency 정리

- `PFS-030` `app/globals.css`의 Pin Feedback 구간을 통째로 먼저 삭제하지 않는다. Class 소비 selector를 새 module로 이동한 뒤 Pin 전용 selector만 제거한다.
- `PFS-031` Pin 전용 admin, campaign form/card/modal, image feedback workspace, report, entry, participant와 presentation selector를 제거한다.
- `PFS-032` 이름에 `pin`, `campaign`, `feedback`이 포함돼도 Class가 사용하는 selector는 소비자를 먼저 Class 이름으로 바꾼 뒤 제거한다.
- `PFS-033` Pin 전용 `pin.*` 번역 key를 제거한다. legacy Class category와 participant marker에 필요한 문구는 Class namespace로 이전한다.
- `PFS-034` `lib/pin/types`를 참조하던 공용 파일은 Class model 또는 제거된 Pin 전용 helper로 의존을 정리한다.
- `PFS-035` package dependency는 Pin tree 삭제 후 실제 소비자를 다시 검색한다. Pin Class가 사용하는 `qrcode.react`, `lucide-react`와 문서 변환 dependency는 제거하지 않는다.
- `PFS-036` CSS·번역·dependency 정리는 별도 호환 shim이나 새 package를 추가하지 않고 기존 Next.js·React·CSS Modules 기능으로 수행한다.

## 5. route 종료 계약

- `PFS-040` 모든 `/pin` route는 소스 삭제 후 Next.js 404를 반환한다.
- `PFS-041` campaign id와 lecture id, campaign join code와 lecture join code는 서로 다르므로 값을 추측해 `/admin/session` 또는 `/join`으로 redirect하지 않는다.
- `PFS-042` `/`, `/login`, `/admin`, `/join/[code]`의 Pin Class 진입 계약은 변경하지 않는다.
- `PFS-043` sitemap, navigation, 설문 home link와 UI copy에서 `/pin` 링크를 제거한다.

## 6. DB, Storage와 migration 보존

- `PFS-050` 기존 Supabase migration 파일은 적용 이력이므로 수정하거나 삭제하지 않는다.
- `PFS-051` `campaigns`, `campaign_pages`, `feedback_pins`, `feedback_pin_reactions`, campaign enum, RPC, trigger, RLS와 Realtime 설정을 그대로 보존한다.
- `PFS-052` `campaign-images` bucket과 모든 객체를 보존한다. Storage 객체 또는 bucket 삭제를 실행하지 않는다.
- `PFS-053` `platform_experience_responses.campaign_id` 행을 포함한 campaign 관련 데이터를 보존한다.
- `PFS-054` Pin Class가 사용하는 `session_folders`, `lecture-slides`, `course-materials`와 복사된 Class 자료를 변경하지 않는다.
- `PFS-055` source·UI 제거를 DB 기능 폐쇄나 데이터 폐기로 표현하지 않는다. 기존 DB API와 데이터는 남는다.
- `PFS-056` 향후 campaign 데이터·권한·schema를 제거하려면 보존 기간, 백업, Storage cleanup과 forward-only migration을 소유하는 별도 승인 문서와 context lock이 필요하다.
- `PFS-057` runtime import 코드는 제거하지만 기존 `import_feedback_campaign` migration과 SQL 회귀 test는 historical compatibility evidence로 유지한다.
- `PFS-058` 데이터, schema와 권한을 변경하지 않으므로 이번 작업에는 새 migration과 데이터 rollback이 없다.

## 7. 구현 순서와 파일 소유권

- `PFS-060` 먼저 공유 로직 relocation package가 Class 경로, 이름과 test를 만든 뒤 모든 Class import를 전환한다.
- `PFS-061` 다음으로 Pin source deletion package가 전용 route, component, lib, API와 test를 삭제한다.
- `PFS-062` Class architecture package가 language context, session Facade와 service에서 Pin runtime·import contract를 제거한다.
- `PFS-063` 모든 소비자가 이전된 뒤 CSS integration package 하나만 `app/globals.css`의 Pin 전용 selector를 제거한다.
- `PFS-064` `app/_model/types.ts`, `app/_model/i18n.ts`, `app/_controller/language-context.tsx`, `app/component/language-switcher.tsx`, `app/_controller/session-store.tsx`, `app/_service/class-session-service.ts`, `app/globals.css`는 각각 한 package만 소유한다.
- `PFS-065` package allowed path는 겹치지 않으며 dependency가 끝나지 않은 삭제 package를 시작하지 않는다.
- `PFS-066` source 삭제 rollback은 package별 Git revert로 수행한다. 보존된 DB·Storage에는 rollback 작업을 실행하지 않는다.

## 8. 검증과 추적성

- `PFS-070` `app/pin`, `components/pin`, `lib/pin`, `app/api/pin`이 남지 않았는지 파일 목록으로 확인한다.
- `PFS-071` 실행 코드에서 `@/lib/pin`, `@/components/pin`, `/api/pin`, PinFeedback import와 `/pin` 링크가 사라졌는지 `rg`로 검증한다.
- `PFS-072` 기존 `/pin` URL이 404를 반환하고 Pin Class의 `/`, `/login`, `/admin`, `/join/[code]`는 기존 계약대로 동작하는지 확인한다.
- `PFS-073` 이동한 presentation rotation test와 `app/_model/question-categories.test.ts`를 실행해 충돌 회피와 legacy category 표시를 검증한다.
- `PFS-074` Class 발표의 PIN 충돌 회피, 공감 milestone·이모지, participant marker picker와 final 설문을 실제 브라우저에서 검증한다.
- `PFS-075` Supabase stack을 시작하고 clean `npm run supabase:reset`, 기존 Class import SQL, `npm run lint`, `npm run build`를 통과한다.
- `PFS-076` campaign table, RPC와 `campaign-images`가 reset 이후에도 존재하고 기존 campaign data를 삭제하는 새 migration이 없음을 확인한다.
- `PFS-077` `class-frontend-architecture`가 요구하는 로그인, 폴더, grid/list, Insights, material, panel, note, scrollbar와 keyboard journey를 함께 검증한다.
- `PFS-078` 최종 diff에 `ponytail-review`를 적용해 불필요한 compatibility code, 중복 CSS와 죽은 dependency를 제거한 뒤 관련 검증을 반복한다.
- `PFS-079` 실제 code·test·evidence 경로를 모든 `PFS-*` 요구사항과 traceability에 연결하고 document-driven final gate를 통과한다.

## 9. 완료 조건

1. 별도 Pin Feedback route, API, component와 library runtime이 저장소에 남지 않는다.
2. Pin Class가 사용하던 발표·legacy category·공감·marker 동작이 Class 이름과 소유 경로에서 동일하게 동작한다.
3. 실행 코드와 UI에 `/pin` 링크 또는 PinFeedback import가 없고 기존 `/pin` URL은 404다.
4. campaign DB schema, RPC, Storage 객체, historical migration과 Class에 복사된 자료가 변경되지 않는다.
5. Supabase reset, SQL·Node test, lint, build, browser journey, Ponytail review와 document-driven verification이 모두 통과한다.
