# 프론트엔드 API와 화면 성능 분석

검토일: 2026-10-14. 대상: `app/(view)`와 `app/component`의 TypeScript 44개 파일(아이콘 재수출 제외), 해당 화면이 호출하는 controller, model, service, infrastructure와 Next API. 화면의 상위 함수와 하위 이벤트·effect·렌더 콜백을 함께 추적했다. 모든 콜백을 각각 실측하거나 모든 사용자 흐름을 E2E로 검증했다는 의미는 아니다.

ID 선택, 중복 집계, 불필요한 정렬·렌더·요청과 무제한 캐시를 개선했다. 전체 목록의 전송·파싱·렌더링은 여전히 데이터 양에 비례한다. 가장 큰 미해결 병목은 첫 로그인에서 모든 강의의 전체 그래프를 반환하는 API와 이를 유지하는 전역 저장소다.

## 복잡도의 기준

- `F`: 폴더 수, `L`: 강의/자료 수, `S`: 슬라이드 수, `Q`: 질문 수, `A`: 한 질문의 답변 수.
- `P`: 현재 화면의 위치 질문 수, `K`: 열린 묶음의 질문 수, `T`: 검색 문자열의 전체 문자 수, `B`: 전송 바이트 수.
- `Map`과 `Set` 조회는 평균 O(1)로 표기한다. 인덱스를 처음 만드는 O(n) 시간·공간을 생략하지 않는다.
- 입력 n개를 모두 읽거나 출력하는 작업은 Ω(n)이다. 일반 비교 정렬은 O(n log n)이며, 메모이제이션은 입력이 같을 때 재계산을 건너뛴다. 계산 자체를 O(1)로 바꾸지는 않는다.
- React 배열·객체의 불변 갱신은 복사하는 크기에 비례한다. 네트워크 요청 수가 O(1)이어도 서버 실행 시간, payload와 UI 갱신 비용은 별개다.

## 적용한 개선

| 중요도 | 함수와 근거 | 이전 비용 | 변경 후 비용과 공간 |
|---|---|---|---|
| 높음 | `FolderTreeSidebar`: 폴더마다 `sessions.filter` | 렌더마다 O(F×L), 임시 배열 반복 생성 | 자료 변경 시 O(L) 집계, 폴더별 평균 O(1) 조회. 표시 O(F), 인덱스 O(F) |
| 높음 | `useSessionAdminController.panelQuestions`: 반환 객체 안에서 매번 정렬 | 초 단위 경과 시간, 노트 입력, 패널 드래그에도 O(Q log Q) | 질문·범위·정렬 기준이 바뀔 때만 정렬. 결과 O(Q) 유지 |
| 높음 | `clusterPins`: 각 PIN에서 모든 기존 중심 탐색 | 정렬 O(P log P) + 중심 검사 최악 O(P²) | 중심이 속한 격자와 주변 8칸만 검사. O(P log P + C), C는 실제 후보 비교 수. 밀집·비정상 거리의 최악 O(P²)는 남는다. 인덱스 포함 O(P) 공간 |
| 높음 | `SlideCanvas`: 매 렌더 군집화·ID 배열 `includes` | ID 필터 O(P×V), 동일 입력 군집화 반복 | 가시 ID `Set`으로 O(P+V), 입력별 군집 결과 재사용. `memo`로 props가 같은 썸네일 렌더 생략 |
| 높음 | `usePinCluster`: ID마다 질문 전체 `filter` | 묶음 선택 시 O(K×Q) | 질문 변경 시 O(Q) 인덱스, 묶음 변경 시 O(K) 추출. 각각 O(Q), O(K) 공간 |
| 중간 | `PinClusterPopover`: 각 행의 `questions.indexOf` | 번호 표시 O(K²), 하이라이트마다 재정렬 | 번호 `Map` 생성 O(K), 행별 평균 O(1), 정렬 결과 재사용 |
| 중간 | 강사/참여자 질문 선택·상세·수정 | 매 선택/렌더 O(Q), 초안 드래그에도 탐색 | 질문 변경 시 O(Q) 인덱스, 이후 평균 O(1) 선택. 추가 참조 O(Q) |
| 중간 | `useDashboardController.visibleSummaries` | 검색어·정렬 변경마다 전체 폴더/자료 재집계 | 집계는 데이터 변경 시 O(F+L), 검색·정렬은 O(F+F log F). 집계 O(F) 유지 |
| 중간 | `useMaterialsController.visible` | 타이핑마다 질문 수 재집계·문자열 재정규화 | 자료 변경 시 집계·검색 텍스트 준비. 타이핑은 자료 검색 O(L+T), 질문 재집계 생략 |
| 중간 | `useSessionPresentationController` | 현재 페이지·강의 설정만 바뀌어도 전체 질문 그룹 재생성 | `session.questions` 변경 시에만 O(Q) 필터·그룹화. PIN ID 키 문자열도 입력별 재사용 |
| 중간 | `SessionEndReport` | AI 응답·재시도 상태 변경에도 통계와 전체 질문 정렬 | 통계 O(S+Q), 정렬 O(Q log Q)을 데이터 변경 때만 실행 |
| 중간 | `toQuestion`: 최신 답변 하나 선택 | 정렬 O(A log A), 복제 배열 O(A) | 단일 순회 O(A), 보조 공간 O(1). 같은 시각이면 기존과 동일하게 마지막 답변 선택 |
| 중간 | `fetchOwnedSessions`, `fetchLiveSessionBy`: 자료/버전 하나 선택 | 전체 복제·정렬 후 첫 원소 선택 | 단일 순회 O(n), 보조 공간 O(1). 최초 자료/최신 버전의 동률 순서 보존 |
| 중간 | `persistSession`: 새 자료 생성 후 상태 저장 | `before` 생성 뒤 같은 상태 RPC 1회 추가 | 기본 신규 자료는 추가 RPC 0회. 다른 상태나 자동 넘김 설정이 있을 때만 저장. 로컬의 생성 후 잘못된 실패 표시도 해결 |
| 중간 | `requestSummary`: 모듈 전역 캐시 | 사용한 모든 질문 조합과 Promise를 계속 보관 | 최대 50개 FIFO. 인증 토큰으로 분리하고 실패는 제거. 고정 엔트리 수이며 실제 바이트는 키·응답 크기에 비례 |
| 중간 | `insertByPage`: 스트리밍 미리보기 | 한 페이지마다 전체 정렬 | 정렬된 기존 배열에서 삽입 위치를 찾아 복사·splice: 페이지당 O(S), O(S) 공간. 전체 스트림의 불변 스냅샷 복사는 최악 O(S²) |
| 중간 | `placeBubbles.blocked/placeAnywhere` | 후보 검사마다 Map 값 배열 복사, 가까운 자리가 있어도 먼 후보 생성 | iterator로 첫 충돌에서 중단, 가까운 빈자리 발견 시 즉시 반환. 배치 결과·선택 우선순위 보존 |
| 중간 | `summarizeEndReport.maximum` | 슬라이드 수만큼 `Math.max` 함수 인수로 펼침 | O(S) reduce, 보조 공간 O(1). 큰 입력의 함수 인수 한도 초과 방지 |

## API 경로 전체 검토

| 경로/함수군 | 요청과 처리 비용 | 판단 |
|---|---|---|
| `restRequest` → `/api/rest/*` → `forward` | JWT/역할 검사 후 요청 1회. JSON 본문/응답은 O(B) 시간·공간. 프록시는 스트림 전달 | 유지. 인증을 캐시하거나 mutation을 자동 재시도하지 않음. 프록시의 취소 신호와 `no-store` 유지 |
| `fetchOwnedClassFolders`, 생성·수정·삭제 | 폴더 목록 O(F), 단건 요청 수 상수. 입력 길이 제한과 owner 경계 유지 | 정상. UI별 중복 집계 수정 |
| `fetchOwnedSessions` → `GET /instructor/courses` | 요청 1회지만 모든 강의·자료·버전·슬라이드·질문·답변을 반환. 강의/슬라이드/질문 표시 순서 정렬은 남음 | **높음, 후속 계약 필요.** 전체 그래프의 전송·파싱·전역 보관을 요청 수만으로 평가하면 안 됨 |
| `fetchLiveSession` / `fetchLiveSessionById` | 익명 세션 확보 후 강의 그래프 + 질문 2회. 버전 선택은 선형, 슬라이드·질문 정렬 O(n log n) | 버전 선택 개선. 404/204/410 구분과 참여자 메모 비노출 유지 |
| `fetchLectureSnapshot` | 전체 보정은 state + questions 2회 병렬, 질문 신호는 questions만 1회. 질문 정렬·변환 O(S+Q log Q+ΣA) | 기존 요청 병합·jitter 유지. 큰 강의에는 질문 delta/cursor 계약이 다음 개선 지점 |
| `fetchSessionSlides` | 활성 자료 슬라이드 요청 1회, O(S) 변환 | 유지. 참여자 응답의 메모 제거 유지 |
| `persistSession`, `convertToSlides`, `uploadSource`, `removeSource` | 원본은 resumable Storage로 전송, 변환은 경로만 전달. PDF 메타데이터와 업로드 병렬. 기존 이미지 업로드는 슬라이드 수에 비례 | 중복 상태 저장 제거. 원본 바이트 O(B) 비용과 슬라이드 DTO O(S)는 필요. 동시 업로드를 무제한 늘리지 않음 |
| `updateLecture`, 노트 저장, 질문 제출/수정/공감/답변/해결, 폴더 이동, 삭제/정리 | 단건 네트워크 요청 수 상수, UI 반영은 저장소의 불변 배열 복사 비용 포함 | 기존 검증·최신 목표 병합·rollback·정리 실패 표시 유지. 단건 API가 곧 전체 O(1)인 것은 아님 |
| `/api/pdf`, `cachedFile`, PDF 문서/미리보기 | 요청마다 RLS 적용 후 디스크 캐시 스트림. 같은 파일 다운로드 병합. PDF.js 문서 공유와 참조 해제, 미리보기 캐시 상한, 화면 밖 렌더 지연 | 유지. 권한 검사를 생략하는 바이트 캐시·service-role 우회 금지. 활성 PDF 문서와 픽셀 면적에 비례하는 메모리 필요 |
| `/api/convert` | 서버 임시 파일과 스트림, 제한된 렌더/업로드 병렬성. 실제 이미지 생성량에 비례 | 유지. 큰 원본을 배열 버퍼로 전부 올리지 않음. 현재 연결 모드의 브라우저 변환 경계는 REST 경로 |
| `/api/question-summary`, `summarizeQuestions`, `summarizeReport` | 클러스터/리포트 입력 개수 제한과 30초 외부 요청 기한. 실제 입력 문자와 출력 길이에 비례 | 클라이언트 캐시 상한·인증 분리 개선. 실제 Groq 지연/비용은 이번 로컬 검증의 측정값이 아님 |
| Auth/profile, Realtime, 반응, audience heartbeat, experience 제출 | 프로필은 사용자별 1회, 활성 강의 구독, 30초 보정/숨김 중 정지, broadcast jitter, 반응 제한, heartbeat 사용 | 기존 부하 제어 유지. UI 선택 최적화 때문에 인증·구독·질문 권한 의미를 바꾸지 않음 |

## 화면 함수와 기능별 검토

하위 콜백의 비용은 해당 상위 함수에 포함했다. `setState` 호출 자체와 그 뒤의 배열 갱신·React 렌더 비용을 구분한다.

| 화면/컴포넌트와 함수 | 기능과 주요 비용 | 조치 |
|---|---|---|
| `/`, `/login`: `Home`, `GoogleIcon`, `LoginContent`, `LoginPage`, `useLoginController`, `startGoogle` | 정적 UI·리다이렉트 O(1), 외부 OAuth 별도 | 유지. 보안 guard를 성능 목적으로 우회하지 않음 |
| `/auth/callback`: `CallbackContent`, `AuthCallbackPage`, `useAuthCallbackController`, 완료 콜백 | 인증 이벤트/8초 기한, 구독·타이머 정리 O(1) | 유지 |
| admin `AdminLayout` | 공개 발표 경로 구분·fail-closed 리다이렉트 O(1) | 유지 |
| dashboard `DashboardPage`, `useDashboardController`, `FolderCard` | 폴더 렌더 O(F). 검색/정렬 O(F log F), `submitFolder/openFolderEditor/closeFolderEditor/removeFolder`는 단건 요청 + 저장소 갱신 | 검색 중 전체 집계 재실행 제거 |
| folder `FolderPage`, `useFolderController`, `FolderMaterialCard` | 범위 추출 O(L), 검색 인덱스 준비 O(T), 검색은 검색어 길이 + 최소 후보 집합과 term 수에 비례. 카드/이동 선택지 표시 O(L×F)까지 가능 | 기존 인덱스 유지. `move/openDelete/closeDelete/confirmDelete`의 권한·오류 처리 보존 |
| materials `MaterialsPage`, `useMaterialsController`, `pick/requestUpload/openSession` | 자료 목록·검색 O(L+T). 기존에는 입력마다 질문 수 집계까지 포함 | 검색 메타데이터와 질문 수 분리 |
| insights `InsightsPage`, `useInsightsController`, `Kpi`, `Empty` | 질문·카테고리·hotspot 집계 O(Q+S), 최신 질문·hotspot 정렬 O(Q log Q+S log S). 화면의 상위 4/8개 표시만 상수 크기 | 기존 순수 집계·메모이제이션 유지. 전체 입력 비용을 상수라고 표시하지 않음 |
| live `SessionAdmin`, `SessionToggle`, `useSessionAdminController` | filmstrip O(S), 질문 렌더 O(Q). 필터/그룹/정렬/선택, 노트·패널 변경에 따른 재렌더 | 질문 정렬·선택·폴더 자료 선택 memo, 썸네일 memo, 공통 군집화 개선 |
| live `runAction/runLectureAction`, 시작·종료·표시 설정 | 동기 제어 O(1), 요청 실패 rollback과 저장소 갱신 별도 | 중복 실행 방지 유지 |
| live `saveSlideNote/changeNoteDraft/saveNoteOnBlur` | pending Map 접근 평균 O(1), draft 객체 복사 O(수정한 슬라이드 수), 저장 직렬화 | 저장 안전성 유지. 입력이 바뀌어도 질문 정렬은 재실행하지 않음 |
| live `changeSlide/resetSlidePageInput/handleSlidePageKeyDown/selectQuestionFromList` | 페이지 검증·현재 페이지 접근 O(1), 상태 저장과 불변 저장소 갱신 별도 | 기존 키보드·자동 저장·범위 검증 유지 |
| live `startQuestionPanelResize/resizeQuestionPanel/finishQuestionPanelResize/resizeQuestionPanelByKeyboard` | 폭 계산 O(1), 리사이즈에 따른 PDF 픽셀 렌더·배치 별도 | 반복 군집화 감소. 기존 400px stage/접근 가능한 separator 유지 |
| live `openPresentation/copyJoinLink/openQuestionDetail/closeQuestionDetail`, 슬라이드 삭제 | 단건 UI 제어 O(1), 삭제 대상 탐색 O(S), 서버 정리 후 슬라이드/질문 재조회 | 창 재사용·에러·삭제 안전성 유지 |
| 준비 `LecturePreparation`, `Icon`, `Toggle` | 예시 PIN은 고정 개수. 슬라이드/노트 표시 O(S) | 공통 SlideCanvas/묶음 개선 재사용. 예시 AI 호출 없음 유지 |
| 발표 `SessionPresentation`, `useSessionPresentationController` | 위치 질문 O(Q), 현재 페이지 질문 O(P), 타이머·Web Locks·동기/로컬 이동 | 질문 배열 기준 memo, PIN ID 키 재사용, 공통 캔버스 개선 |
| 발표 `goToSlide/revealControls/rotateQuestions/toggleFullscreen/closePresentation` | 이동·브라우저 제어 O(1), 다음 PIN 선택은 현재 PIN 수에 비례 | 자동 공개·상세 dialog 정지·첫 창 제어권 유지 |
| 리포트 `ReportPage`, `SessionEndReport` | 세션 선택 O(L), 통계 O(S+Q), 근거 정렬 O(Q log Q), 실제 차트/질문 결과 렌더 | 통계/근거 memo, 대형 배열 max 확장 제거, 요약 캐시 제한 |
| 참여 `JoinSession`, `useJoinSessionController` | 목록 O(Q), 현재 슬라이드 그룹 O(Q) 준비, 정렬 O(Q log Q), PIN 선택·초안·공감·이모지 | 선택/수정/상세 ID 인덱스, 선택 PIN O(1), 자기 질문 여부 memo |
| 참여 `placeDraftTag/updateDraftText/clearDraftQuestion/startMovingDraftTag/moveDraftTag/finishMovingDraftTag/openDraftComposer` | 좌표 계산 O(1), draft 객체 복사 O(초안 슬라이드 수) | 기존 초안·pointer capture·좌표 제한 유지 |
| 참여 `submit/closeComposer/selectTool/changeSlide/syncToLiveSlide/selectQuestionSort/toggleQuestionReaction/sendEmojiReaction` | 단건 제어 O(1), 질문 저장/갱신 O(L+Q), pending Set 복사 O(동시 반응 수) | 기존 재시도·오류·반응 간격 유지. 다른 사람의 숨겨진 PIN 노출 없음 |
| 종료 `LectureFinalPage`, `PlatformExperienceForm`, `usePlatformExperienceController`, `submit` | 길이가 제한된 두 입력과 단건 제출 | 유지 |
| `FolderTreeSidebar` | 폴더 수 표시·열기·접기, 자료 수 집계 | 중첩 필터 → 한 번의 Map 집계 |
| `SlideCanvas`, 클릭/measurement 콜백 | PIN 필터·군집·말풍선 크기 측정/배치 | memo/Set/Map 적용. DOM 측정은 질문·크기·표시 입력 변경 때만 수행 |
| `PdfPage`, `previewKey/restorePreview/rememberPreview/acquireRenderPriority`, 내부 render/schedule | 파일+페이지 캐시 조회, 캔버스 복사 O(픽셀), 표시된 페이지 렌더. ResizeObserver+rAF와 이전 작업 취소 | 기존 지연 렌더·우선순위·미리보기 상한·문서 정리 유지 |
| `SlidePreview`, `UploadProgress` | 진행 텍스트 O(1), 완성/대기 썸네일 표시 O(S) | 공통 썸네일 memo 재사용. 업로드 미리보기 삽입 정렬 제거 |
| `MaterialUploadDialog`, `upload/update` | 파일 큐 O(파일 수), 한 파일씩 처리. 진행 상태 배열 갱신 O(큐 길이) | 순차 업로드와 실패 복구 유지. 신규 자료의 불필요한 상태 RPC 제거 혜택 적용 |
| `QuestionSummary`, `PinClusterPopover`, `usePinCluster`, `QuestionCard`, `QuestionDetailDialog` | 최대 20개 요약 근거, 묶음 선택·정렬·번호·포커스 복원/해제 | 묶음 중첩 탐색/번호 O(K²) 제거. 접근성·답변/해결 위치 유지 |
| `AdminSidebar/AdminShell`, `WorkspaceAccount/WorkspaceHeader`, `AdminSearch`, `LanguageSwitcher`, `LoadingScreen`, `PinLogo`, `StatusBadge` | 활성 강의 탐색 O(L), 나머지 고정 UI와 이벤트. 공유 번역·인증 context 변경은 실제 재렌더 필요 | 불필요한 범용 캐시·새 UI 프레임워크 추가 없음 |

## 측정 결과

Node 22.18.0, macOS arm64. 40px 간격으로 분산한 합성 PIN을 x/y 기준 정렬하여 기존 알고리즘과 출력 전체를 비교했다. 두 번 warm-up 후 7회 중앙값이다. 운영 네트워크, 실제 강의 분포, 모바일 FPS/메모리 측정이 아니다.

| PIN 수 | 기존 중앙값 | 개선 중앙값 | 기존 거리 비교 | 개선 거리 비교 |
|---:|---:|---:|---:|---:|
| 100 | 0.141ms | 0.158ms | 4,950 | 75 |
| 1,000 | 14.209ms | 1.110ms | 499,500 | 2,500 |
| 5,000 | 337.740ms | 5.304ms | 12,497,500 | 13,000 |

작은 입력에서는 Map/격자 관리 비용 때문에 100개가 약 0.02ms 느려졌다. 1,000개는 약 12.8배, 5,000개는 약 63.7배 빨랐다. 분포에 무관한 O(1)이나 동일한 운영 개선율을 보장하지 않는다.

## 남은 병목과 백엔드 전달 사항

1. **높음: 전체 강의 그래프 선로딩.** `SessionStore` 초기화가 `fetchOwnedSessions`를 호출한다. 로컬 OpenAPI에도 별도 요약·페이지네이션 endpoint가 없다. 폴더/자료 요약 DTO에는 ID·이름·상태·최신 시각·표지 1개·슬라이드/질문/미답변 count만 제공하고, 선택 자료의 slides/questions/notes를 별도로 읽는 계약이 필요하다. 승인된 `CFA-050~053` 목표와 현재 구현의 차이다. 백엔드 저장소는 수정하지 않았다.
2. **높음: 질문 전체 snapshot.** 큰 강의의 보정마다 모든 질문을 재전송·정렬한다. 변경 cursor, 삭제 tombstone, 동일 권한을 적용하는 delta API를 백엔드와 정한 뒤 적용해야 한다. 클라이언트에서 임의로 질문을 잘라내면 누락이 생긴다.
3. **중간: 큰 목록의 DOM.** filmstrip, 질문 목록과 자료 카드 자체는 O(n) 렌더다. 현재 썸네일 memo/화면 밖 PDF 지연 렌더를 유지하고, 실제 큰 강의에서 DOM·long task가 병목일 때 키보드/포커스를 보존하는 windowing을 적용한다. 임의 표시 개수 제한은 적용하지 않았다.
4. **중간: 말풍선 DOM reflow와 밀집 배치.** 내용·크기가 변하면 여러 모양을 실제 측정한다. 입력이 같을 때는 재측정하지 않지만 큰 배치의 최악 복잡도는 남는다. 추정 크기로 변경하면 현재 배치 의미와 텍스트 가독성을 검증해야 한다.
5. **중간: 전역 context/불변 배열 갱신.** 질문 1개를 바꿔도 세션/질문 배열 복사와 소비자 재렌더가 필요하다. route별 최소 DTO·상태로 옮길 때 줄일 비용이며, 한 줄 mutation을 위해 데이터 모델을 임의로 바꾸지 않았다.
6. **검증 설정:** `.env.local`은 Supabase `127.0.0.1:56321`, REST `127.0.0.1:8080`이다. 실행 중인 로컬 Supabase 프로젝트 이름은 `ohpin_be`이며 FE CLI의 `pin_class`와 달랐다. `.env.production.local`에는 운영 Supabase URL이 있어 production build와 development 설정을 구분해야 한다. 설정 파일과 DB schema는 변경하지 않았다.

## 검증

- `npm run lint`, `npm run build` 통과. FE migration을 추가하지 않아 DB reset은 실행하지 않았다.
- 관련 Node 테스트 31개 통과: 기존 API/JWT/오류/메모 비공개, 통계, 검색, 요청 병합, PIN 공개/말풍선 배치/PDF 캐시, 신규 군집 비교·지역 탐색·캐시 인증 분리/상한/재시도·미리보기 순서.
- 100개 무작위 군집 데이터, 중심의 격자 이동, 정확한 동률, 0/무한 거리와 기존 invalid/미측정 좌표를 비교했다. 1,000개 희소 PIN의 후보 비교가 8,000회 미만임을 시간에 의존하지 않고 검사한다.
- 최신 답변 동률, 자료/버전 선택 순서, 신규 `before` 자료의 중복 RPC 제거, 자동 넘김 설정 보존을 검사했다. 슬라이드 200,000개의 통계 max 계산도 검사했다.
- 로컬 Supabase의 격리된 검증 계정으로 로그인 guard·대시보드·폴더·grid/list·자료 열기·PDF 실제 업로드를 검증했다. 30페이지 PDF 업로드가 준비 완료로 표시되어 중복 상태 저장 수정 효과를 확인했다.
- 1440×1000 headless Chrome에서 폴더 rail 접기, 질문 패널 키보드 리사이즈(359px), 발표 메모의 실제 서버 저장, 좌우 키 이동을 검증했다. 30개 썸네일의 `scrollWidth=2888`, `clientWidth=913`, `overflow-x=auto`, 표시 가능한 scrollbar와 현재 페이지 border를 확인했다.
- 로컬 익명 참여자가 같은 위치에 제출한 질문 3개로 강사 PIN 군집 팝오버와 참여자 join/질문 목록을 검증했다. AI endpoint는 브라우저에서 503 mock으로 대체해 실제 외부 모델을 호출하지 않았다. 테스트 강의는 종료했다.
- 검증 후 격리된 계정의 검증용 강의·폴더를 삭제하고 강의 목록이 0개임을 확인했다. 임시 인증 파일과 별도 headless 브라우저도 정리했다.
- 운영 OAuth·배포·운영 데이터·대규모 동시 접속·첫 화면 3초/질문 p95 2초는 이번 결과에 포함하지 않는다. 실제 Groq 호출도 하지 않았다.
- 최종 diff에 `ponytail-review`를 적용하고 안전한 간소화와 import 정리를 반영한 뒤 lint/build/관련 테스트를 다시 통과했다. 새 dependency, migration, backend 변경, 인증 우회는 없다.
