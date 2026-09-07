# Pin 강의 서비스 PRD — Lecture Question Intelligence Platform

> 내부 제품명: **Pin Class** (GVCGE의 Lecture Adapter). 참고 문서: `Pin 최종 PRD — Visual Feedback Intelligence Platform`(피드백 도메인, 이 문서의 구조·원칙 계승). 최초 작성: 2026-07-20. 최종 갱신: **2026-08-26**. model-council(Codex + Claude deep/balanced) 교차분석과 2026-08-26 저장소 구현 상태를 반영.
> 

---

## 0. 요약

> **Pin Class는 수강생이 강의 슬라이드의 정확한 위치에 남긴 질문을, 코스 단위로 축적해 강사의 답변·강의 개선·강의 특화 AI(Course Brain)로 전환하는 강의 질문 인텔리전스 플랫폼이다.**
> 

Pin Class는 “실시간 Q&A 도구”도 “AI 질의응답 서비스”도 아니다. 제품의 본체는 **질문이 발생한 시각적 맥락(슬라이드 위 좌표)을 보존하고, 여러 강의·회차에 걸쳐 강의 개선 데이터로 축적하는 데이터 레이어**다. 

AI는 이 데이터를 소비하는 상위 계층이지, 최초 가치가 아니다.

**핵심 등식**

```
Material(강의 자료 — AI가 이해한 슬라이드·페이지)
+ Region(슬라이드의 어느 부분인지 — 0~1 좌표·영역)
+ Concept(그 부분이 무엇에 대한 것인지 — 개념 라벨·OCR, 확장)
+ Question(무슨 질문인지 — 원문 + intent) + Status + Timestamp
= Grounded Lecture Question Data (GVCGE / GLQO 정합)
```

**핵심 파이프라인**

```
강의자료 업로드(슬라이드 이미지화·AI 이해 — 확장) → 수강생이 막힌 위치 클릭 → 질문 입력
→ 위치·의미 기반 질문 클러스터 → 슬라이드·개념 단위 빈도(혼란 핫스팟)
→ 강사 답변·상태(미답변/답변/해결) → 강의 개선 리포트
→ [축적] 코스 단위 Course Brain → [확장] 강의 특화 AI 에이전트(RAG)
```

**이 문서의 4가지 확정 사항**

1. **데이터가 제품이다.** 질문은 “슬라이드의 어느 부분(좌표·영역)” + “무슨 개념인지(라벨)” + “무슨 질문인지(원문)” + “해결됐는지(상태)”를 하나로 저장하는 1급 데이터 단위다. 개별 질문보다 **위치·개념·회차에 걸친 누적 패턴**이 장기 자산이다.
2. **핵심 단위는 코스다.** `Course(강의 묶음) > Lecture(세션) > Material > Slide > Question`. 단일 강의·컨퍼런스 세션은 `Course 1 = Lecture 1`로 우아하게 흡수한다. 회차 누적·개념 그래프·강의 특화 AI는 모두 코스를 자연 경계로 삼는다.
3. **돈은 운영사 또는 강사가 낸다.** 주 구매자는 **사교육·직무교육 운영사(팀 플랜)**이고, 강의 품질이 곧 본인 매출인 **개인 강사·프리랜서 강사·인강 강사도 직접 구매자**가 될 수 있다(개인 플랜). 가치 제안은 “질문을 예쁘게 받아서”가 아니라 **강의 품질을 데이터로 개선해 수료율·후기·재계약(강사 개인은 재수강·평판) 리스크를 줄이기 때문**이다.
4. **P0에서 수강생 대상 AI 자동답변은 넣지 않는다.** 먼저 `좌표 질문 → 강사 답변 → 강의 수정`의 폐쇄 루프를 증명하고, RAG·Course Brain은 데이터가 쌓인 뒤 얹는다. AI를 앞세우면 핵심 가설(질문 데이터 축적)을 검증할 수 없다. (model-council 공통 결론)

**슬로건 후보**

- 메인(대외): **“질문이 찍힌 곳에서, 더 나은 강의가 시작됩니다.”**
- B2B(운영사): **“슬라이드 위 질문을 코스의 지식으로.”**
- 장기 비전(AI): **“놓친 질문까지 쌓이는 Course Brain.”**

### 0.1 현재 구현 기준선 (2026-08-30)

이 절은 비전이 아니라 현재 저장소에서 확인되는 실행 가능한 제품 범위다. 아래의 `완료`는 UI, session store, Supabase repository와 migration 경로가 연결되어 있다는 뜻이며, 파일럿 성과가 검증됐다는 뜻은 아니다. 작업 트리에만 존재하는 안정화 변경은 완료 범위에 포함하지 않는다.

| 영역 | 현재 구현 | 상태 |
| --- | --- | --- |
| 진입·인증 | `/` 분기, Google OAuth 강사 로그인, 익명 Supabase 참여자 세션, admin fail-closed guard, 자격 증명 없는 로컬 demo 모드 | 완료 |
| 폴더·자료 | 폴더 중심 대시보드, 이름 검색, 미분류, 폴더 생성·삭제(자료는 미분류 이동), 자료 이동·삭제, grid/list 전환 | 완료 |
| 업로드 | PDF 원본 페이지 렌더링, PPT/PPTX 이미지 변환, 페이지 순서 보존, 스트리밍 진행률, Supabase Storage 저장, 이미지 슬라이드 추가·삭제 | 완료 |
| 강사 라이브 | LIVE/STOPPED, 현재 슬라이드 동기화, 핀↔질문 연결, 답변·해결, 검색·상태 필터, 폴더 rail 접기, 질문 패널 크기 조절, 발표 메모 | 완료 |
| 수강생 참여 | QR/링크 무설치 진입, point PIN 질문, marker·강의별 카테고리, 본인 미답변 질문 수정, 다른 질문 보기·공감, 실시간 이모지 | 완료 |
| 발표 | 별도 발표 창, 전체화면·키보드 이동, PIN 노출·강조, 공감 효과, 상호작용 모드, QR 표시·위치 설정 | 완료 |
| 인사이트 | 폴더 전체/자료별 scope dropdown, 질문·미답변·핀 비율·해결률, 슬라이드 핫스팟 순위, 카테고리 분포, 미답변 목록 | 완료(기본 집계) |
| 데이터·보안 | Postgres/RLS, 계정 범위 캐시, Realtime, 질문·답변 Course Brain 원장 적재, 발표 메모의 participant 경로 분리 | 완료 |
| PinFeedback 연계 | 동일 소유자의 PinFeedback 캠페인을 이미지·공개 PIN·카테고리·marker·공감과 함께 Pin Class 자료로 일회성 복사 | 완료(단방향 import) |
| P0 잔여 | 슬라이드 전체 질문, Class 질문 CSV, 제출 draft 영속 복구, 이름 선택 정책, 관찰 이벤트와 파일럿 계측 | 미완료 |
| AI 리포트 | 선택·생성·검토·수정·확정·근거·PDF의 제품 명세 작성 중. 증거·시스템 명세와 구현은 승인 전 | 설계 중 |
| Course Brain AI | 임베딩 검색, 클러스터, RAG 답변·복습자료 생성 | 미구현 |

현재 정보 구조는 `로그인 → 폴더 대시보드 → 폴더(자료/인사이트) → 자료 라이브 워크스페이스`다. 관리자 화면은 desktop-first, 참여자 화면은 mobile-first다. `/pin` 캠페인 제품은 별도 surface이며, 위의 단방향 import 외에는 타입·UI·운영 흐름을 섞지 않는다.

---

## 1. 제품 정의와 포지셔닝

### 1.1 무엇이 달라지는가 — 질문에 좌표와 맥락을 준다

기존 강의 Q&A는 텍스트 스레드가 중심이고, 질문이 “어느 슬라이드·어느 부분”에 대한 것인지는 데이터로 남지 않는다.

| **도구** | **입력 구조** | **슬라이드 위치의 지위** |
| --- | --- | --- |
| **LMS 게시판 / 카톡** | 텍스트 질문 | 없음 (말로 “3페이지 그 표…”) |
| **Slido / Pigeonhole** | 텍스트 Q&A + 업보트 | 없음 |
| **Mentimeter “Pin on Image”** | 이미지 위 클릭 | 있으나 **정답 응답용**(강사가 낸 문제에 위치로 답하기) — 방향이 반대 |
| **Classum** | SNS형 스레드 Q&A + AI 답변 | 없음 (좌표 앵커 없음) |
| **Pin Class** | **슬라이드 위 좌표 클릭 → 질문** | **슬라이드 자체가 질문 데이터의 좌표계** |

Pin Class에서는 **질문이 좌표를 가진다.**

```
Lecture 3 · Slide 12 · (0.41, 0.25)  →  "이 gradient 식이 왜 이렇게 되나요?"
```

이것이 저장되는 순간, 30명이 각자 “이 부분 이해 안돼요”, “여기 왜 이래요”, “이 식 모르겠어요”라고 다르게 적어도 시스템은 **전부 같은 슬라이드·같은 지점(같은 개념)이라는 것을 안다.**

```
Slide 12 · learning-rate 발산 영역  ↑  질문 18건 (혼란 핫스팟)
```

기존 도구는 이 결론에 도달하려면 강사가 흩어진 질문을 전부 읽고 어느 슬라이드에서 나온 이야기인지 되짚어야 한다. Pin Class는 위치가 데이터이므로 이 결론이 **집계 연산**으로 나온다.

### 1.2 한 문장 정의와 카테고리 전략

- **내부 제품 정의**: `Lecture Question Intelligence Platform` — 강의 자료 위 좌표에 앵커된 질문을 코스 단위로 구조화해 강의 개선 인사이트와 강의 특화 AI로 전환하는 플랫폼.
- **구매자 언어(외부)**: 새 카테고리 이름을 앞세우지 않는다. 앞세우는 것은 결과다:
    - *“수강생이 어디서 막히는지, 슬라이드 한 장으로 보여드립니다.”*
    - *“질문을 다음 기수 커리큘럼 개선 데이터로 바꿔드립니다.”*

#### **정의문 (확정)**

흩어진 강의 질문을 스레드로 쌓는 도구가 아니라, **질문이 발생한 슬라이드 위치와 개념을 데이터로 보존하고 회차에 걸쳐 강의 개선·강의 특화 AI로 전환하는 플랫폼.**

### 1.3 Pin Class가 지향하지 않는 것 (경계 원칙)

- **완성형 LMS가 아니다** — 출결·성적·과제 제출·결제를 만들지 않는다.
- **범용 실시간 투표/퀴즈 도구가 아니다** — Slido·Mentimeter와 폴·워드클라우드로 경쟁하지 않는다. 질문의 위치·맥락·개선 루프가 제품이다.
- **수강생용 범용 AI 튜터가 아니다(P0)** — 강의 특화 AI는 축적된 질문·자료·답변 데이터를 근거로만 답하는 상위 계층이며, P0에서는 수강생 자동답변을 넣지 않는다.
- **근거 없는 일반론 리포트 서비스가 아니다** — 모든 인사이트·리포트 문장은 원본 질문·슬라이드로 100% 역추적된다.

### 1.4 제품 적합성 기준

> **슬라이드 위 “어디서 막혔는지”가 강의 개선의 의미를 바꾸는 곳 — 강사-수강생 관계가 반복되고, 강의 품질이 돈과 연결되는 곳 — 이 Pin Class의 시장이다.**
> 

질문하는 사람이 많고(N↑), 그 질문을 강의 개선으로 연결해야 하는 강사·운영자가 병목인 구조일수록 가치가 커진다. 대학처럼 강의 개선 니즈·지불의사가 약한 곳은 고객이 아니다.

---

## 2. 문제 정의

### 2.1 왜 대학 교수-학생을 버렸는가 (타겟 재정의)

- **교수는 초기 구매자가 아니다** — 강의 개선이 개인 매출과 직결되지 않아 **“돈 내고 쓸” 긴급도가 없다.** 인터뷰에서 질문을 더 받고 다음 강의를 업그레이드하려는 강한 니즈가 관찰되지 않았다.
- **학생은 교수가 아니라 AI에게 묻는다** — 대학 수업은 **성적·시험용으로 수강하는 경향**이 크고 학문 자체를 위한 질문 동기가 약하다.
- **결론**: 강사-수강생 관계가 중요하고, 강사가 질문을 기반으로 자료를 개선해야 하며, 강의 품질이 매출과 직결되는 **사교육·대형 강의 시장**으로 타겟을 옮긴다.

### 2.2 강의 도메인의 구조적 문제 (근거)

- **질문이 강사 대신 AI로 이탈한다.** 청소년의 ChatGPT 과제 사용률이 13%(2023)→26%(2025)로 늘었고, 학생은 강사보다 AI에 먼저 묻는 행동이 관찰된다. → 강사는 수강생이 어디서 막혔는지 신호를 잃는다. ([nchstats](https://nchstats.com/teens-use-chatgpt-for-homework/), [StudyChat arXiv](https://arxiv.org/pdf/2503.07928))
- **대면 질문 장벽.** 학생 26.5%가 “바보 같은 질문일까 두려움”, 22%가 “동료 판단 우려”로 질문을 삼킨다. 익명 질문 큐가 이 불안을 완화한다는 연구가 있다. ([Edugist](https://edugist.org/why-many-students-are-afraid-to-ask-questions-in-class/), [arXiv 1901.01061](https://arxiv.org/pdf/1901.01061))
- **질문·능동학습의 학습효과는 실증된다.** 능동학습 메타분석에서 성취(대학 인문사회 +0.489 SD), 파지 g=0.33, 이해 g=0.28, 전이 g=0.43. 전통 강의 대비 낙제 가능성 1.5배(PNAS 2014). → “질문을 살리는 것”은 학습 개입이다. ([Springer](https://link.springer.com/article/10.1007/s10734-022-00977-8), [PNAS](https://www.pnas.org/doi/10.1073/pnas.1319030111))
- **강사의 병목 — 질문을 강의 개선으로 연결하는 시간.** 흩어진 질문을 읽고, 어느 슬라이드·개념인지 되짚고, 반복 질문을 파악해 다음 자료에 반영하는 과정이 전부 수작업이다. Pin Class는 이 구간을 제품으로 만든다.

### 2.3 UX 리서치가 확인한 설계 조건 (참고 PRD 계승)

1. **접수보다 처리 과정** — 질문 상태(미답변→답변→해결)와 “반영됐다”는 회신이 참여를 만든다.
2. **수강생 UX와 강사 UX 분리** — 수강생에겐 단순 입력·답변 확인, 강사에겐 히트맵·분석·상태 관리.
3. **입력은 최대한 단순하게** — 앱·회원가입 없이, 진입 후 2단계 안에 질문.
4. **억지 핀 방지** — 위치가 필요 없는 질문을 위한 “슬라이드 전체 질문”을 함께 제공.

---

## 3. 시장과 경쟁

### 3.1 차별화 판정 — “좌표 질문을 집계해 강의 개선·강의 AI로 전환하는 제품은 없다”

> **판정: 슬라이드 위 좌표에 질문을 앵커링 → 집계·분석 → 강의 개선 리포트 + 그 데이터로 만든 강의 특화 AI, 이 3요소를 하나로 묶은 제품은 시장에 사실상 부재하다.** (개별 요소는 다 존재, 결합·특히 “질문 좌표를 강의 개선 신호로 전환”하는 축은 공백. 신뢰도: 중간~높음 — 전수조사 불가)
> 

| **제품** | **가격(요지)** | **좌표 질문 앵커** | **질문 집계·분석** | **강의개선 리포트/강의 AI** |
| --- | --- | --- | --- | --- |
| **Slido** | 무료~Pro $75/월·Ent $200/월, 교육 €5/월 | 없음(텍스트 Q&A·업보트) | 업보트 순위·CSV | 없음 |
| **Mentimeter** | 교육 $11~17/월 | **부분** — Pin on Image는 **정답 응답용**(방향 반대) | 폴 집계 | 없음 |
| **ClassPoint** | PPT 애드인 | **부분** — 슬라이드 주석/드로잉 응답 | 응답 수집 | 없음 |
| **Vevox / Wooclap / Poll Everywhere** | 무료~저가 | 없음 | 폴·Q&A 집계 | 없음 |
| **Pigeonhole Live** | 이벤트당 $338~928 | 없음 | Q&A·업보트 | 없음 |
| **Classum** | 비공개, 13,000+ 기관 | 없음(SNS형 스레드) | 스레드 Q&A + **AI DOT** | AI 답변 있으나 **좌표 없음·강의개선 리포트 아님** |
| **Coursera Coach** | 온라인 코스 내장 | 없음 | — | **코스 콘텐츠 기반 AI**(퀴즈 통과율 +9.5%) — 라이브 질문 데이터 미사용 |
| **Pin Class** | (검증 예정) | **○ 슬라이드 좌표 질문** | **○ 위치∩개념 집계·혼란 핫스팟** | **○ 강의개선 리포트 + 코스 특화 RAG** |

**함의**: ① “위치 클릭”과 “질문+AI”는 인접 제품이 각각 존재하나(Mentimeter Pin=응답용, Classum=스레드+AI, Coursera Coach=코스 AI), **“자발적 질문을 좌표에 앵커링해 강의 개선 신호로 집계”**하는 결합은 아무도 하지 않는다. ② **가장 큰 경쟁 위협은 Classum** — 한국 사교육·기업교육에서 “질문+AI”를 이미 선점(11M pre-Series B, 삼성·LG아카데미 등). 이들이 좌표 앵커를 애드온으로 붙이면 격차가 빠르게 좁혀진다. → 방어선은 좌표 UX가 아니라 **회차 누적·개념 그래프·근거 추적·Course Brain**이다.

출처: [Slido 가격](https://www.slido.com/pricing) · [Mentimeter Pin on Image](https://help.mentimeter.com/en/articles/4582546-how-to-use-pin-on-image-slides) · [Classum(G2)](https://www.g2.com/products/classum/reviews) · [Classum 투자(Training Industry)](https://trainingindustry.com/press-release/learning-technologies/classum-lands-11m-pre-series-b-funding-accelerating-interactive-learning/) · [Coursera Coach](https://www.coursera.org/explore/coach) · [Pigeonhole 가격](https://pigeonholelive.com/pricing/)

### 3.2 타겟 시장 평가와 진입 순서

| **시장** | **강사-수강생 반복성** | **지불의사** | **데이터 축적 적합성** | **판정** |
| --- | --- | --- | --- | --- |
| **사교육·직무교육 운영사** (부트캠프·AI/IT 직무교육·국비 위탁·성인 학원) | ★★★★★ | ★★★★ | ★★★★★ | **1순위 (비치헤드)** — 강의 품질이 후기·수료율·재계약과 직결, 회차 반복으로 데이터 축적 |
| **대형 컨퍼런스·포럼·세미나** | ★☆ (1회성) | ★★★★ (예산·즉결) | ★☆ (누적 불가) | **마케팅·검증 채널** — 대량 동시 사용자로 좌표 UX·성능 쇼케이스, 브랜드 노출로 사교육 리드 확보. 핵심 가치(개선 루프·AI)의 검증지는 아님 |
| 대학 정규 강의 | ★★ | ★☆ | ★★ | **제외** — 교수 지불의사·강의 개선 니즈 약함(§2.1) |

**진입 순서 권고: 사교육·직무교육 먼저, 컨퍼런스는 나중(마케팅·검증용).** 컨퍼런스는 시장은 크지만(오디언스 응답 SW 약 25.8억 달러, 2025) 1회성이라 “강의 특화 AI”의 핵심 가치가 발현되지 않는다. ([오디언스 응답 SW 시장](https://www.wiseguyreports.com/reports/audience-response-software-market))

### 3.3 ROI 근거 (비치헤드 = 국비·직무교육)

- **국비교육(KDT/HRD)은 취업률·수료율·만족도로 훈련기관을 평가**하고, 이는 등급·재위탁(최대 5년 인증)에 직접 반영된다. 중도이탈이 영세 기관의 고질적 문제로 지목된다. → “이탈 방지·수료율·만족도 개선”이 정부 예산·재위탁과 직결되는 강한 ROI 화법. ([HRD 성과평가](https://www.hrd4u.or.kr/evaluation), [work24 훈련기관](https://www.work24.go.kr/hr/a/a/3200/selectTrainInstitution.do))
- **부트캠프 만족도의 1순위 요인이 강사 품질·커리큘럼**이며, 만족도-추천의향 상관이 높다. → “질문 데이터로 강의 개선 → 만족도 → 후기·추천 → 신규 등록”의 인과 사슬. ([switchup 조사](https://www.switchup.org/rankings/coding-bootcamp-survey), [ERIC 부트캠프 만족도](https://eric.ed.gov/?id=EJ1342036))
- **한계**: “핀 도구 도입 → 수료율 X%p 상승” 같은 정량 인과 실증은 공개 데이터가 없다 → **파일럿 전후 측정으로 확보**한다(구두 약속은 계약이 아니다).

### 3.4 확장 비전

> **“모든 강의 슬라이드 위에서 질문이 살아나고, 그 질문이 코스의 지식이 되는 플랫폼.”**
> 

같은 좌표·코스 데이터 스키마 위에서 어댑터만 갈아 끼워 사교육 → 기업 사내교육 → 컨퍼런스 → (장기) 대학·MOOC로 확장한다. 단, 영업은 한 번에 한 시장씩.

---

## 4. 고객 — 돈은 누가 내는가

### 4.1 주 구매자는 운영사, 강사는 사용자이자 직접 구매자일 수 있다

| 역할 | 핵심 불편 | Pin Class가 제공하는 것 |
| --- | --- | --- |
| **수강생(참여자)** | 대면 질문 부담, 위치를 말로 설명, 질문이 반영되는지 모름 | 무설치 QR → 슬라이드 위 핀 → 질문, 익명 옵션. 답변·“반영됐어요” 회신 |
| **강사(핵심 사용자 · 개인 구매자 가능)** | 어느 슬라이드에서 막혔는지·반복 질문·미답변 파악 어려움, 개선 포인트를 데이터로 못 정리. 개인 강사는 강의 품질=본인 매출(재수강·평판·후기) | 슬라이드별 질문 히트맵·혼란 핫스팟·미답변 목록·강의 개선 리포트. 개인 강사에겐 개인 플랜 직접 구매 경로 |
| **운영사(주 구매자·결정권자)** | 강사별 강의 품질 편차, 수료율·후기·재계약 리스크를 늦게 발견 | 코스·강사별 질문/미답변/개선 리포트, 회차 전후 비교, 교육 효과 보고 자료 |

### 4.2 지불 논리·ROI

- 주 지불자는 **운영사(교육기획·운영팀장·대표)**. **개인 강사·프리랜서·인강 강사는 직접 지불자**(개인 플랜, PLG 진입 경로). 수강생은 무제한 무료.
- ROI 화법: 운영사 = `강의 품질 리스크(이탈·낮은 후기·재위탁 탈락) 감소 + 강사가 질문을 개선으로 연결하는 시간 절감` / 개인 강사 = `재수강·후기·평판 개선 + 강의 준비 시간 절감`.
- 가격 앵커: 참여도구(Slido Pro $75/월·Ent $200/월, Mentimeter $11~17/월)·LMS SaaS. 시작점: **코스/좌석 단위 구독 + 유료 파일럿**(첫 계약에서 검증).
- 검증 지표: 강사 분석시간 절감, 다음 회차 자료 수정 건수, 미응답 감소, 운영 리포트 실제 활용 여부. **무료 사용 의향은 구매 신호로 인정하지 않는다.**

---

## 5. 제품 구조

### 5.1 데이터 체인 — 질문에서 강의 개선으로

```
Question → Cluster → Insight → Improvement → Outcome
(개별 질문)  (위치∩개념 묶음) (혼란 핫스팟)  (자료·설명 개선)  (다음 회차 변화)
```

| **단위** | **원칙** |
| --- | --- |
| **Question** | 수강생이 남긴 개별 질문. 슬라이드·좌표·intent·상태(미답변/답변/해결)를 가진다 |
| **Cluster** | 위치+의미가 비슷한 질문 묶음 = 개념 단위. 강사가 합치고 나누고 라벨 수정 |
| **Insight** | 반복 혼란·미답변 핫스팟. 원본 질문 연결 100% 필수 |
| **Improvement** | “이 슬라이드 보강 / 이 개념 예시 추가” 등 개선 과제(담당·기한 선택) |
| **Outcome** | 다음 회차 같은 위치 질문 감소 등 전후 비교 |

예: `Slide 12 learning-rate 영역 질문 18건 → "발산 이유 혼란" 인사이트 → "step-size 시각 예시 추가" 개선 → 다음 기수 같은 질문 60% 감소`

### 5.2 관리 단위 — 질문 상태 + 개선 과제 (피드백 PRD와의 차이)

피드백 PRD는 관리 단위가 `Action`뿐이고 개별 건 상태를 만들지 않았다. **강의 도메인은 다르다** — 질문은 “답변받아야 하는” 학습 객체이므로 질문 자체가 상태를 가진다:

```
질문 상태:  unanswered → answered(강사 답변 등록) → resolved(이해 완료 판정) → archived
```

현재 제품은 답변 저장과 강사 `해결` 처리를 제공하고 DB enum에는 위 상태가 남아 있다. 다만 `answered`와 `resolved`를 실제로 분리할지는 §16의 파일럿 결정이며, 확정 전까지 두 상태의 차이를 성과 지표로 과해석하지 않는다. **범용 티켓/칸반/결재선은 만들지 않는다.** 강사 워크플로는 답변·상태·개선 과제까지만 확장한다.

### 5.3 사용 모드 — 라이브 + 사후 (단일 모드가 아님)

피드백 PRD는 “수집 종료 후 일괄 분석” 단일 모드였다. Pin Class의 목표는 **라이브(수업 중 질문 확인)와 사후(복습 질문·회차 분석)를 함께** 지원하는 것이다. 현재 새 질문은 LIVE 강의에서만 받고, 종료 후에는 저장된 질문·답변·인사이트를 조회한다. `occurred_in='post'`는 PinFeedback import 데이터에 사용되며, 종료 후 신규 복습 질문 수집 UI는 아직 없다.

### 5.4 공통 코어와 강의 어댑터 (GVCGE)

| 계층 | 공통 코어 (GVCGE, 도메인 불문) | 강의 어댑터 (Pin Class) |
| --- | --- | --- |
| 수집 | QR 무설치 + 기준 이미지(슬라이드) 위 좌표 핀 + 텍스트 | 코스/강의 세션, 슬라이드 자료, 질문 카테고리(이해안됨·개념·예시·오류·중요·복습) |
| 구조화 | 좌표-텍스트 매핑, 위치∩의미 클러스터 | 개념 단위 클러스터, 질문 intent |
| 인텔리전스 | 빈도·히트맵·자동 분류·리포트 | 혼란 핫스팟·미답변·강의 개선 리포트 |
| 운영 | 상태 흐름 엔진 | 질문 상태(답변/해결)·개선 과제 |
| 데이터 | 좌표 스키마 + Edge + 임베딩 | Course Context·Concept Graph·Course Brain(RAG) |

시장이 바뀌어도 좌표·코스 데이터 스키마는 그대로다 — 이것이 확장의 기술적 근거다.

### 5.5 현재 화면 구조

| 화면 | 역할 | 현재 상태 |
| --- | --- | --- |
| `/login` | Google OAuth 강사 진입. 인증 후 폴더 대시보드로 이동 | 구현 |
| `/admin/dashboard` | 좌측 폴더 트리, 폴더 검색·생성·삭제, 미분류 자료 업로드, 폴더별 자료·슬라이드·질문 요약 | 구현 |
| `/admin/folders/[id]` | 자료 검색·grid/list·이동·삭제와 폴더/자료 scope 인사이트 | 구현 |
| `/admin/session/[id]` | 라이브 슬라이드·질문·답변·해결·발표 설정·발표 메모·슬라이드 편집 | 구현 |
| `/admin/session/[id]/present` | 라이브 강의의 비로그인 공개 발표 화면. 강사만 current_page를 변경하며 공개 화면은 동기화된 슬라이드·PIN·공감·QR을 읽기 전용으로 표시 | 구현 |
| `/join/[code]` | 익명 참여자의 PIN 질문·공감·이모지·답변 확인 (모바일 우선) | 구현 |
| `/join/[code]/final` | 참여 종료 후 경험 설문 | 구현 |

대시보드에는 현재 소유 폴더를 구조도로 보여주는 전용 sidebar를 두되, 폴더 상세 이후에는 전역 sidebar를 이어가지 않는다. 폴더 상세의 `자료 | 인사이트` 탭과 자료 워크스페이스의 `라이브 | 질문 목록` 탭이 각 의사결정 범위를 나눈다. AI 리포트는 별도 전역 메뉴가 아니라 폴더 상세 `인사이트`에서 시작한다.

---

## 6. 사용자 경험

### 6.1 수강생 — 슬라이드 위에서 질문

```
QR/링크 접속 → 현재 슬라이드 표시 → PIN(point) 표시
→ marker·카테고리·질문 입력 → 제출 → 다른 질문 공감·답변 확인
```

원칙: ① 위치 먼저, 텍스트는 나중 ② 로그인·앱 없음, Supabase anonymous session으로 작성자 권한만 구분 ③ PIN 좌표는 0~1 비율값(기기·화면 무관 동일 지점) ④ 본인이 남긴 미답변 질문만 수정 가능 ⑤ “나도 궁금해요” 공감은 중복 없이 desired state로 저장하며 본인 질문에는 공감할 수 없음 ⑥ 강의가 종료되면 새 질문과 공감을 닫고 완료 설문으로 안내 ⑦ **억지 핀 방지용 슬라이드 전체 질문과 실패 draft 영속 복구는 아직 P0 잔여**.

- `CLASS-JOIN-001` 참여자 작성 도구는 PIN과 실시간 Emoji만 제공한다. Pen/freehand UI와 path draft·제출 경로는 제거하고, Supabase 쓰기 경계에서도 참여자의 신규 anchor는 point만 허용한다. 기존 box·path anchor 데이터와 강사 조회·표시는 삭제하지 않는다.
- `CLASS-JOIN-002` 참여자 질문 목록은 기본 `공감순`과 `최신순`을 즉시 전환할 수 있어야 한다. 두 정렬은 공감 수 또는 작성 시각이 같은 경우에도 결정적인 순서를 유지하며, 목록은 한 화면에 질문 카드 최대 4개가 보이는 높이와 밀도로 제한하고 초과 항목은 목록 내부 스크롤로 탐색한다.

### 6.2 강사 — 폴더에서 라이브와 사후 분석으로

```
폴더 상세
├─ 자료        무엇을 열까 — 검색, grid/list, 이동·삭제, 업로드
└─ 인사이트   어디서 막혔나 — 폴더 전체/자료별 KPI·핫스팟·카테고리·미답변

자료 작업 공간
├─ 라이브      지금 무엇에 답할까 — 현재 슬라이드·PIN·질문·빠른 답변·발표 설정
└─ 질문 목록  무엇이 남았나 — 검색·상태 필터·카테고리 관리·원문에서 슬라이드 이동
```

- **핀↔︎질문 목록 양방향 연결이 핵심 상호작용**: 핀 클릭 → 원문으로, 원문 클릭 → 핀으로.
- `CLASS-DASH-001` 대시보드 좌측 패널은 ClassPin 로고와 Project 아이콘, 소유 폴더 수, 현재 폴더 링크를 트리 구조로 표시하고 접기·반응형 탐색을 지원한다. 이 패널은 기존 소유 폴더 조회를 재사용하며 별도 데이터 원본을 만들지 않는다.
- `CLASS-DASH-002` 폴더 카드의 accent 색상은 검색 전 전체 폴더 순서에서 결정하며, 이름 검색으로 일부 카드만 표시돼도 각 폴더의 색상이 바뀌지 않는다.
- `CLASS-DASH-003` 폴더 상세의 자료 항목은 grid/list 보기에서 하나의 재사용 가능한 카드 컴포넌트로 렌더링한다. Grid 카드는 제공된 세로형 디자인의 비율과 위계에 맞춰 썸네일, 제목·부제, 구분선, 슬라이드·질문·미답변 수를 한 표면에 표시하고, 절대 좌표 대신 반응형 레이아웃과 기존 semantic 토큰을 사용한다. 자료 열기, 이동·삭제, 키보드 접근성과 200% 확대 동작은 유지한다.
- `CLASS-UPLOAD-001` 강의 자료는 PDF/PPT/PPTX 파일당 최대 1GiB를 허용한다. 큰 원본은 앱 서버 요청 본문을 거치지 않고 owner 전용 Storage에 재개 가능한 조각 업로드한 뒤, 변환 서버가 해당 원본을 스트리밍으로 읽는다.
- `CLASS-UPLOAD-002` PPT/PPTX에서 생성하는 발표용 슬라이드 이미지는 긴 변을 최대 3840px로 렌더링하고 JPEG 최고 품질(100)로 인코딩해 4K 화면에서도 선명도를 유지한다. 기존에 렌더된 PDF 슬라이드도 그대로 표시한다.
- `CLASS-UPLOAD-003` 신규 PDF는 owner 전용 `course-materials`의 원본을 슬라이드 JPEG로 변환·저장하지 않고 PDF 페이지를 브라우저에서 필요할 때 렌더링한다. `slides`는 원본 PDF 페이지 번호 또는 추가 이미지 경로 중 하나만 참조해 PIN·질문·메모·순서를 유지하고, 원본 페이지 삭제는 PDF를 재작성하지 않고 해당 `slides` 매핑만 제거한다. 수강생은 라이브 강의의 PDF만 읽을 수 있고 발표 메모는 응답과 PDF 접근 경로에 포함하지 않는다. 기존 이미지 슬라이드와 PDF 자료에 추가한 이미지 슬라이드는 현재 표시·추가·삭제 동작을 유지한다.
- 라이브 화면의 폴더 rail은 같은 폴더 자료를 전환하며 접을 수 있고, 질문 패널은 desktop에서 300–560px 범위로 조절한다.
- `CLASS-LIVE-001` 라이브 stage 상단 액션 행은 왼쪽에 `QR 없애기`와 네 모서리 위치를 고르는 QR 배치 드롭다운을, 오른쪽에 기존 슬라이드 추가·삭제 동작을 둔다. 오른쪽 패널에서는 별도 슬라이드쇼 상호작용·QR 위치 섹션을 제거하고 `실시간 질문` 토글 하나만 남기며, 이 토글이 발표 화면의 PIN·질문 라벨·PIN 상태 표시를 직접 제어한다. QR 표시·위치는 이 토글과 독립적으로 기존 강의 설정에 한 번에 저장하고, 참여자의 실시간 Emoji는 계속 표시한다. 비워진 패널 공간은 질문 목록이 사용한다.
- `CLASS-LIVE-002` 라이브 화면의 오른쪽 질문 카드를 클릭하면 해당 슬라이드로 이동하고 그 질문의 PIN만 brand blue로 선택 강조한다. 질문 카드는 상세 dialog를 열지 않으며 PIN 클릭만 상세 dialog를 연다. 강사의 답변 작성과 해결 동작은 상세 dialog 안에서만 제공하고 오른쪽 패널의 inline 답변 영역은 두지 않는다.
- `CLASS-LIVE-003` `실시간 질문`이 켜진 발표 화면은 슬라이드가 둘 이상이면 현재 슬라이드의 PIN을 모두 순차 노출한 뒤 1초 후 다음 슬라이드로 이동하고, PIN이 없으면 기존 3초 주기를 사용하며 마지막 장 다음에는 첫 장으로 순환한다. 슬라이드에 진입하거나 재방문할 때마다 PIN 순차 노출을 처음부터 다시 시작한다. 어느 슬라이드에서든 새 위치 PIN 질문이 도착하면 첫 snapshot과 단순 수정은 제외하고 즉시 해당 슬라이드로 이동해 새 PIN을 강조하며, 새 PIN부터 그 슬라이드의 전체 PIN 순환을 다시 시작한다. 현재 슬라이드에 새 PIN이 들어와도 동일하게 다시 순환하고 모든 PIN 노출 1초 후 다음 슬라이드로 이동한다. 질문 상세 dialog가 열린 동안은 PIN 순차 노출과 자동 이동을 멈추며, 다른 슬라이드로 이동하면 이전 dialog를 닫는다. 기존 수동 탐색과 강사 current page 동기화는 유지한다.
- `CLASS-INSIGHTS-001` 폴더 인사이트 범위는 가로 스크롤 chip 목록 대신 폴더 전체와 각 자료를 즉시 선택할 수 있는 단일 선택 dropdown으로 제공한다. dropdown은 기존 semantic token, 접근 가능한 이름, native 키보드 선택 동작을 유지하는 custom visual style을 사용한다.
- `CLASS-PRES-001` Class 발표 화면은 Feedback 발표 화면의 충돌 회피 전략을 재사용해 point PIN을 캔버스 안의 겹치지 않는 위치로 펼치고, 활성 말풍선을 우선 보존하면서 다른 PIN 또는 보존된 말풍선과 겹치는 비활성 말풍선을 숨긴다.
- 발표 메모는 슬라이드 아래에 저장하지만 참여자 조회·AI 리포트 evidence에는 포함하지 않는다.
- 현재 인사이트는 코드 기반 기본 집계다. 개념 클러스터·회차 비교·AI 개선 리포트·개선 과제는 후속 범위다.
- 만들지 않는 것: 칸반 드래그·알림 센터·결재선.

---

## 7. 데이터 모델 — Course 중심, GVCGE(GLQO) 정합

### 7.1 설계 원칙

1. **핵심 단위는 코스.** `Course > Lecture(Session) > Material > Slide > Question > Answer`. 대부분의 자식 테이블에 `course_id`를 비정규화해 **코스 롤업(개념 그래프·Course Brain)과 강의 뷰를 동시에 값싸게** 지원한다.
2. **질문은 GVCGE의 UGAO에 1:1 매핑**된다. 질문의 point·box·path는 `region_anchors`의 0~1 정규화 좌표로 분리하고, polygon은 AI/admin 확장용으로 예약한다.
3. **좌표는 `material_version_id`에 고정** — 슬라이드 개정 시 핀이 어긋나지 않는다.
4. **기능은 나중에, 데이터는 처음부터.** MVP가 작아도 스키마는 GVCGE(Vector·Graph 하이브리드)·RAG 확장 가능한 형태를 유지한다.

### 7.2 계층 트리

```
Course ─┬─ Lecture(Session) ─┬─ Material ─ MaterialVersion ─ Slide ─┬─ RegionAnchor(pin)
        │                     │                                      └─ Question(UGAO) ─ Answer
        ├─ SpaceMembership(role)         └─ ClassSession 속성(interaction_mode, current_page)
        ├─ CourseBrainMemory (RAG chunk 원장)
        ├─ Cluster (위치∩개념)
        ├─ Insight / ImprovementAction (파생)
        └─ ConceptGraph / graph_edges (Phase 1+)
```

#### 7.2.1 현재 UI·DB 매핑

- 업로드 1건은 현재 `Course 1 : Lecture 1 : Material 1 : MaterialVersion 1`로 생성된다. 폴더가 여러 업로드 자료를 묶는 실제 관리자 집계 단위다.
- `courses.folder_id`는 `(folder_id, owner_id)` 복합 FK로 다른 소유자의 폴더 연결을 차단한다. 폴더 삭제는 course를 지우지 않고 `folder_id = NULL`로 만든다.
- 한 자료를 삭제하면 그 자료에 딸린 course·lecture·material·version·slide·question·answer·memory와 소유자의 Storage 객체를 함께 정리한다. 한 슬라이드 삭제는 해당 질문을 삭제하고 뒤 page index와 current page를 원자적으로 보정하며 마지막 한 장은 삭제하지 않는다.
- `slide_instructor_notes`는 slides와 분리된 owner-only 테이블이다. participant repository는 이 테이블을 조회하지 않는다.
- `/pin`과 Pin Class는 소유자 폴더 테이블을 재사용하지만 도메인 타입과 UI는 분리한다. PinFeedback 연계는 원본 캠페인을 변경하지 않는 idempotent 단방향 import다.
- 장기 목표는 한 Course 아래 여러 Lecture·Material을 묶는 회차 누적 모델이다. 현재 업로드 중심 UI에서 이 계층을 언제 노출할지는 §16의 제품 결정으로 남는다.

### 7.3 핵심 스키마 (SQL 요지)

```sql
CREATE TABLE courses (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, title text NOT NULL,
  folder_id uuid,                                      -- owner와 복합 FK, 삭제 시 NULL
  subject_domain text,
  visibility text CHECK (visibility IN ('public','private','link')),
  reuse_policy_id uuid REFERENCES reuse_policies(id),   -- 확장 훅
  created_at timestamptz DEFAULT now()
);

CREATE TABLE lectures (            -- = Session
  id uuid PRIMARY KEY, course_id uuid NOT NULL REFERENCES courses(id),
  seq_no int NOT NULL, title text,
  interaction_mode text CHECK (interaction_mode IN ('live','async','hybrid')),
  status text CHECK (status IN ('scheduled','live','ended','archived')),
  current_page int,                                     -- 라이브 동기화
  started_at timestamptz, ended_at timestamptz,
  UNIQUE (course_id, seq_no)
);

CREATE TABLE materials (
  id uuid PRIMARY KEY, lecture_id uuid NOT NULL REFERENCES lectures(id),
  course_id uuid NOT NULL,                              -- 비정규화(롤업)
  type text CHECK (type IN ('slide_deck','pdf','image')),
  current_version_id uuid
);
CREATE TABLE material_versions (
  id uuid PRIMARY KEY, material_id uuid NOT NULL REFERENCES materials(id),
  version_no int NOT NULL, source_uri text, checksum text,
  UNIQUE (material_id, version_no)
);
CREATE TABLE slides (
  id uuid PRIMARY KEY,
  material_version_id uuid NOT NULL REFERENCES material_versions(id),
  page_index int NOT NULL, image_uri text, width_px int, height_px int,
  UNIQUE (material_version_id, page_index)
);

CREATE TABLE region_anchors (
  id uuid PRIMARY KEY, slide_id uuid NOT NULL REFERENCES slides(id),
  material_version_id uuid NOT NULL,                    -- 좌표 고정
  kind text CHECK (kind IN ('point','box','path','polygon')),
  coords jsonb NOT NULL,                                -- point/box/path, 0~1
  created_by text CHECK (created_by IN ('user','ai','admin')),
  CONSTRAINT chk_user_anchor CHECK (created_by <> 'user' OR kind IN ('point','box','path'))
);

CREATE TABLE questions (           -- = UGAO
  id uuid PRIMARY KEY, course_id uuid NOT NULL,         -- 비정규화
  lecture_id uuid NOT NULL REFERENCES lectures(id),
  slide_id uuid REFERENCES slides(id),                  -- NULL = 슬라이드 전체/코스 질문
  region_id uuid REFERENCES region_anchors(id),
  author_id uuid, is_anonymous bool DEFAULT true,
  intent text CHECK (intent IN ('question','opinion','issue','request')),
  raw_text text NOT NULL, normalized_text text, category text, marker text,
  reaction_count int NOT NULL DEFAULT 0,
  status text CHECK (status IN ('unanswered','answered','resolved','archived')),
  occurred_in text CHECK (occurred_in IN ('live','post')),
  cluster_id uuid, embedding_ref uuid,                  -- 확장 훅
  created_at timestamptz DEFAULT now()
);

CREATE TABLE answers (
  id uuid PRIMARY KEY, question_id uuid NOT NULL REFERENCES questions(id),
  author_id uuid, body text NOT NULL,
  visibility text CHECK (visibility IN ('private','participants','public')),
  is_ai_generated bool DEFAULT false,
  source_chunk_ids uuid[],                              -- RAG 근거(Phase 1)
  created_at timestamptz DEFAULT now()
);

CREATE TABLE slide_instructor_notes (
  slide_id uuid PRIMARY KEY REFERENCES slides(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) <= 10000)
); -- owner/admin 전용 RLS, participant 조회 경로에서 제외

CREATE TABLE course_brain_memory (  -- 코스 단위 append-only RAG 원장
  id uuid PRIMARY KEY, course_id uuid NOT NULL REFERENCES courses(id),
  lecture_id uuid,                                      -- NULL = 코스 전역
  chunk_type text CHECK (chunk_type IN
    ('question','answer','material_text','slide_caption','cluster_summary','insight')),
  source_id uuid, content text NOT NULL,
  embedding vector(1536),                               -- MVP엔 NULL 허용
  reuse_consent bool DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Phase 1+ (스키마만 선행 생성, MVP 비활성)
CREATE TABLE ai_visual_objects ( id uuid PRIMARY KEY, slide_id uuid, label text,
  ocr_text text, bbox jsonb, internal_only bool DEFAULT true );
CREATE TABLE alignments ( id uuid PRIMARY KEY, object_id uuid, question_id uuid,
  iou real, semantic_sim real,
  status text CHECK (status IN ('candidate','confirmed','rejected')) );
CREATE TABLE graph_edges ( src uuid, dst uuid, rel_type text, weight real );  -- SIMILAR_TO 등
```

- **코스 롤업 vs 강의 뷰**: `course_id` 비정규화로 강의 뷰는 `WHERE lecture_id=?`, 코스 개념 그래프는 `WHERE course_id=?` 단일 인덱스 스캔. Cluster·Insight·CourseBrainMemory는 `course_id`에 매달아 코스 롤업을 1급 시민으로.
- **좌표 저장 방식(구현 결정)**: point·box·path를 `coords jsonb`에 저장하고 DB CHECK로 0~1 범위, box 경계, path 2–512점을 검증한다. 참여자의 신규 입력은 RLS에서 point만 허용하며, 기존 box·path는 이력 보존을 위해 읽기 전용으로 유지한다. polygon은 AI/admin 확장용으로만 남기고 참여자 입력에는 허용하지 않는다.

### 7.4 좌표·라이브·버전 처리

- **라이브 동기화**: `lectures.current_page`를 강사가 갱신하고 Supabase Realtime으로 전달한다. 참여자는 기본적으로 current page를 따르며 수동으로 다른 슬라이드를 본 뒤 다시 현재 슬라이드로 복귀할 수 있다.
- **버전**: 슬라이드 개정 = 새 `material_version` + 새 `slides`. 기존 핀은 옛 버전에 고정, 신규 핀은 신규 버전에. 버전 간 자동 리앵커링은 Phase 1.
- **현재 핫스팟**: 자료/폴더 범위에서 슬라이드별 질문 수와 미답변 수를 코드로 집계해 순위를 표시한다. 좌표 격자 heatmap은 아직 구현하지 않았다.
- **후속 클러스터**: 같은 슬라이드의 좌표를 격자(예: 20×20)로 버킷팅하고 위치(1차)∩의미(2차, 정규화 텍스트 임베딩)를 코스 단위로 묶어 개념 그래프 노드로 확장한다.

### 7.5 강의 특화 AI(RAG) 데이터 파이프라인 — 저장은 MVP, 검색·생성은 Phase 1

`course_brain_memory`가 **코스 단위 append-only 원장**. 질문·답변·자료 텍스트·슬라이드 캡션·클러스터 요약·인사이트를 `chunk_type`으로 정규화해 한 테이블에 축적.

- **MVP 경계 = “저장만”**: 질문·답변 생성 시 chunk INSERT, `embedding`은 NULL. 검색/생성 API 없음. → 스키마·적재 파이프라인이 MVP에서 완성되므로 Phase 1은 순수 추가(임베딩 백필 + 검색)만으로 확장, 재마이그레이션 불필요.
- **Phase 1 = “검색·생성”**: 임베딩 백필 → `WHERE course_id=? AND reuse_consent=true` + 벡터 근접으로 RAG 컨텍스트 구성. 강의 특화 AI 답변은 `answers.is_ai_generated=true` + `source_chunk_ids`로 근거(슬라이드·원문 질문) 100% 역추적.

### 7.6 확장성 훅 (MVP에 없어도 스키마에 선행)

`alignments.status`(사람 검수) · `reuse_policies` + `courses.reuse_policy_id` + `chunk.reuse_consent`(데이터셋 export 동의) · `embedding_ref`/`embedding`(지연 백필) · `graph_edges`(SIMILAR_TO·GROUNDED_IN·TARGETS) · `ai_visual_objects.internal_only`(사용자 비노출). 전부 NULL/비활성 가능 → 선행 생성 비용이 낮고 나중에 컬럼 추가보다 백필이 쉽다.

### 7.7 저장소

PostgreSQL(+pgvector) 단일 DB — 관계·좌표·상태·벡터를 한 트랜잭션 경계에서. S3 원본 자료. 전용 Vector/Graph DB는 확장(E4) 전까지 도입하지 않는다.

---

## 8. AI 인텔리전스 파이프라인

### 8.1 원칙 (참고 PRD 계승)

1. **수치는 코드가, 서술은 LLM이** — 질문 수·미답변율·처리시간·위치 분포는 SQL만 산출. LLM은 해석·서술만.
2. **근거 추적 100%** — 모든 인사이트·리포트·AI 답변은 원본 질문·슬라이드로 역추적. 근거 없는 문장 생성 차단.
3. **근거 2건 미만이면 기권.** 4. **승인 전 자동 실행 금지**(개선 과제·상태는 강사 확정). 5. **AI 객체 인식은 사용자 비노출.**
4. **수강생 대상 AI 자동답변은 P0 제외** — 질문 축적 가설 검증 전 도입하지 않는다.

### 8.2 파이프라인 5단계

```
⓪ 자료 이해[AI·업로드 시, Phase 1]  슬라이드 설명·개념 라벨링·OCR → 내부 전용
① 수집[코드]        질문 저장, 개인정보·부적절 검출
② 구조화[코드+AI]   핀→슬라이드/영역 매칭, 임베딩, 카테고리·intent 1차 분류
③ 집계[코드만]      슬라이드·개념 단위 질문 수·미답변·혼란 핫스팟·Δ
④ 생성[LLM]        검증된 집계 JSON → 강의 개선 리포트·개선 제안 초안(구조화 출력)
⑤ 검증[코드+사람]   인용 질문 ID 실존·원문 일치·수치 재계산 → 강사 검수 → 공개
```

현재 베타는 라이브 질문 표시·답변과 코드 기반 사후 기본 집계까지 구현했다. AI 일괄 리포트·실시간 자동 분석·RAG는 승인된 문서와 파일럿 evidence 이후의 Phase 1이다.

### 8.3 강의 특화 AI (Course Brain) — Phase 1+

코스에 축적된 자료·질문·강사 답변·클러스터를 근거로만 답하는 코스 특화 에이전트. 용도: 수강생 복습(“지난 3주 반복 질문 정리”, “이 개념 헷갈린 질문 모아줘”), 강사 준비(“이 코스에서 매번 막히는 지점”), 복습자료·FAQ 자동 생성. 원칙: **자료·질문·답변만 근거로, 슬라이드·원문 질문 인용, 근거 없으면 기권.** 범용 AI 튜터와의 차별점은 “이 코스의 맥락(강사 설명·수강생이 실제로 막힌 지점)”을 안다는 것.

---

## 9. 기능 요구사항 — 4계층 × P0/P1/P2

계층: **수집 → 구조화 → 인텔리전스 → 운영/강의개선.**

### 9.1 ① 수집

| 우선순위 | 기능 | 2026-08-26 상태 |
| --- | --- | --- |
| **P0** | QR·링크 무설치 참여(앱·가입 UI 없음, anonymous auth) | 완료 |
| **P0** | 코스·강의(세션) 생성, 슬라이드(PPT/PDF) 업로드·페이지 렌더·순서 보존(PDF는 원본 페이지를 클라이언트에서 렌더링) | 완료 |
| **P0** | 슬라이드 point·box·path → marker·카테고리·질문 입력·본인 미답변 수정 | 완료 |
| **P0** | 위치가 필요 없는 슬라이드 전체 질문 | 미구현 |
| **P0** | 기관 정책 기반 익명/이름 선택, 제출 실패 시 draft 영속 복구 | 미구현(현재 익명 고정·화면 내 draft만 유지) |
| **P0** | 참여자 모바일 대응(44px target, 현재 슬라이드 복귀) | 완료 |
| **P1** | 라이브 current_page 동기화, “나도 궁금해요” 공감 | 완료(선행 구현) |
| **P1** | 실시간 이모지 반응, 발표 상호작용 on/off | 완료(선행 구현) |
| **P2** | 영상 타임코드 질문, 참여자별 스크린샷(E3 이후) | 미구현 |

### 9.2 ② 구조화

| 우선순위 | 기능 | 2026-08-26 상태 |
| --- | --- | --- |
| **P0** | 0~1 정규화 point·box·path 저장, DB 범위 검증, material version 고정 | 완료 |
| **P0** | PIN ↔︎ 질문 목록 양방향 연결, 검색·상태 필터 | 완료 |
| **P0** | 카테고리 필터, 질문 숨김·복원 | 미구현(강의별 카테고리 생성·이름·활성화·archive 관리는 완료) |
| **P0** | 좌표·질문·상태가 연결된 Class CSV 다운로드 | 미구현(`/pin` CSV와 별도 필요) |
| **P1** | 위치∩의미 하이브리드 클러스터, 수동 합치기·나누기·라벨 | 미구현 |
| **P1** | 질문·답변 Course Brain chunk 적재(embedding NULL 허용) | 완료 |
| **P1** | 임베딩 영속화·백필 | 미구현 |
| **P2** | 자료 AI 이해·객체 라벨링·alignment, 회차 간 SIMILAR_TO 연결 | 미구현 |

### 9.3 ③ 인텔리전스

| 우선순위 | 기능 | 2026-08-26 상태 |
| --- | --- | --- |
| **P0** | 기본 통계(질문·미답변·PIN 비율·해결률·카테고리·최근 질문) | 완료 |
| **P1** | 슬라이드별 질문/미답변 핫스팟 순위 | 완료(선행 구현) |
| **P1** | 좌표 heatmap·위치 밀도, 개념별 빈도 Top-N | 미구현 |
| **P1** | 근거 기반 강의 개선 리포트, A/B 표현, AI 수정·확정·PDF | 제품 명세 작성 중, 구현 전 |
| **P1** | 회차 전후 비교(같은 위치 질문 감소) | 미구현 |
| **P2** | 강의 특화 AI(RAG) 질의·복습자료 자동 생성, 학습 데이터셋 export | 미구현 |

### 9.4 ④ 운영·강의개선

| 우선순위 | 기능 | 2026-08-26 상태 |
| --- | --- | --- |
| **P0** | 질문 상태·강사 답변·해결, 강의 LIVE/STOPPED·재시작 | 완료 |
| **P0** | 폴더·자료·슬라이드 lifecycle과 데이터 손실 경고 | 완료 |
| **P1** | 별도 발표 화면, 전체화면·PIN·QR·상호작용 설정 | 완료(선행 구현) |
| **P1** | 개선 과제(담당·기한 선택), 결과 공개(“반영됐어요”) 회신 | 미구현 |
| **P1** | 코스·강사별 운영 리포트(운영사용) | 미구현 |
| **P2** | LMS export·연동, 다중 조직·권한, 답변 AI 추천(+강사 확정) | 미구현 |

### 9.5 만들지 않는 것 (P0)

수강생 대상 AI 자동답변 · 자동 개념 클러스터링 · 완전 RAG 챗봇 · LMS·출결·결제 연동 · 고급 조직 권한 · 수강생 간 스레드 토론·퀴즈 · 영상 타임코드 · 강의 품질 점수·예측 분석. **특히 수강생 AI 자동답변은 질문 축적 가설 검증 전 도입하지 않는다.** 단, 한국어/영어 UI와 질문 공감·실시간 이모지는 실제 참여 흐름 검증을 위해 이미 선행 구현했다.

---

## 10. 비기능 요구사항

- **화면 전략**: 수강생은 mobile-first(iOS Safari·Android Chrome, 터치 44px+), 강사 workspace는 desktop-first responsive다. 900px 아래에서도 핵심 기능을 숨기지 않는다.
- **정확성**: 기기 간 좌표 동일성 = 기능 인수 기준·상시 모니터링. 근거 연결률 100% = 릴리스 차단.
- **성능 목표**: 첫 유효 화면 3초, 질문 제출 API p95 2초. 업로드는 1GiB 이하 PDF/PPT/PPTX를 받으며 재개 가능한 원본 업로드 진행을 보여준다. PDF는 클라이언트에서 현재·노출 페이지만 지연 렌더링하고, PPT/PPTX는 변환·Storage 업로드 진행을 스트리밍한다. 이 수치는 관찰 이벤트가 연결되기 전까지 목표값이지 실측 보장이 아니다.
- **신뢰성**: 중복 공감은 desired-state RPC와 PK로 방지한다. 슬라이드 추가·삭제와 자료 삭제는 DB/Storage를 함께 정리하고, 실패 시 UI rollback 또는 재시도 가능 오류를 제공한다. 질문 제출 draft의 새로고침 후 복구와 관리형 백업 검증은 잔여 과제다.
- **인증·권한**: 강사는 Google OAuth `admin`, 수강생은 anonymous `participant`다. Supabase 설정 시 admin guard는 fail closed이며 owner RLS를 우회하지 않는다. 단, `/admin/session/[id]/present`는 라이브 강의 데이터만 익명 조회하는 공개 읽기 화면이고 current_page 변경은 강사에게만 허용한다. 로컬 자격 증명이 없을 때만 demo mode를 허용한다.
- **개인정보·법무**: 참여자 작성자 UUID는 audience payload에 노출하지 않고 `is_mine`만 계산한다. 발표 메모는 owner-only 테이블과 조회 경로로 격리한다. **강사 자료 저작권은 course.owner 귀속, reuse_policy로 재사용·데이터셋화 범위 명시** / AI 학습 재사용은 별도 동의(`reuse_consent`) 전 기본 불허 / 삭제 요청 시 원문·임베딩 동시 삭제.
- **데이터 권위**: Supabase mode에서는 Postgres가 권위 원본이고 localStorage는 계정별 실패 캐시다. demo mode에서만 localStorage + BroadcastChannel이 권위 원본이다.
- **관찰성**: 핀 생성·제출·답변·상태 변경·리포트 조회 이벤트 기록(ROI 측정 데이터 소스).
- **접근성**: 의미 있는 상태는 텍스트+아이콘+색으로 표시하고, tab/switch/separator에 semantic role과 키보드 조작을 제공한다. focus-visible, 200% zoom, reduced motion을 유지한다.
- **언어**: 한국어/영어 UI를 제공한다. 사용자 생성 콘텐츠와 AI 리포트의 번역은 범위 밖이다.

---

## 11. 성공지표

### North Star

> **질문이 실제 강의 개선으로 이어진 비율** — “질문 → 강사 답변 → 다음 회차 자료 수정/설명 변경”까지 완료된 비율. **핀 생성량 자체를 북극성으로 삼지 않는다**(보기엔 새롭지만 강의를 못 바꾸면 실패). (model-council 공통 강조)
> 

**가드레일**: 미답변율(낮게 유지) · AI 리포트 수정률(0%면 과신 경고) · 재사용률(다음 회차·다음 코스 재생성).

### 계층별 지표

| 계층 | 지표 | 기준 |
| --- | --- | --- |
| 작동 | 기기 간 좌표 동일성, 제출 성공률, 오류율 | 오류율 5% 이하 |
| 참여자 행동 | QR 진입률 / 질문 작성률 / 첫 질문까지 시간 / 재사용률 | 진입 60%+ / 작성 30%+ / 60초 이내 |
| **좌표 가치 증명** | ① 좌표 질문이 일반 질문보다 강사의 맥락 파악 시간을 줄이는가 ② 추가 설명 요구·오해율 감소 ③ 자료 수정 전환율 | 파일럿마다 재증명 |
| 강사 가치 | 미답변 감소, 반복 질문 감소, 리포트 활용, 다음 회차 자료 수정 건수 | — |
| 사업 | 유료 계약, 2회차 캠페인, 같은 운영사 내 확장, ROI 배수 | 절감·개선 ≥ 요금 3배 |

실증 인용 규칙: 검증된 범위와 검증 예정 범위를 구분한다. 구두 약속은 계약이 아니다.

---

## 12. 수익 모델

- **과금 단위**: 강사 개인 플랜(직접 구매·PLG 진입) / 코스 단위 구독 / 운영사 팀 플랜. **수강생 무제한 무료.**
- **티어**: 수집·구조화(기본) ↔︎ 인텔리전스·강의 개선 리포트(상위) ↔︎ 강의 특화 AI/Course Brain(프리미엄, Phase 1+). “질문 수집에 내는 돈 vs 분석·AI에 내는 웃돈”을 파일럿에서 구분 측정.
- **가격 앵커**: 참여도구 Slido/Mentimeter(월 수만 원~수십만 원), LMS SaaS. 시작점은 **유료 파일럿(코스 단위)** 후 구독 전환. (첫 계약에서 검증)
- **첫 유료 구매 단위(오픈)**: 강사 개인 vs 코스 vs 운영사 좌석제 — 파일럿에서 예산 승인·확장성이 가장 좋은 모델 확인.

---

## 13. 해자

1. **축적 해자(본체)**: QR+핀 UX는 모방 가능. 그러나 **코스별 “슬라이드 위치 → 개념 → 반복 질문 → 강사 답변 → 개선 결과” 시계열 축적**은 시간 종속 자산이다. 회차가 쌓일수록 강의 특화 AI가 정교해진다.
2. **스키마 해자**: 좌표·코스 스키마 + GVCGE 공통 코어 = 도메인 이식 속도 우위.
3. **전환비용**: 회차 누적·Course Brain이 쌓인 운영사는 이탈 시 코스 지식 연속성을 잃는다.
4. **정직한 한계**: 데이터가 없는 초기 12~18개월 방어선은 해자가 아니라 **개선 루프의 반복 증명과 수직 특화 속도**다. 파일럿마다 다시 증명한다.

---

## 14. 리스크와 대응

| 리스크 | 평가 | 대응 |
| --- | --- | --- |
| **AI가 질문을 흡수해 데이터가 안 쌓임** — 수강생이 애초에 AI로 해결 | 높음 | P0에서 수강생 AI 제외. AI보다 “질문 등록”을 먼저 수행하게 설계. 이후 AI 선노출군 vs 질문 선등록군의 저장률·강사 답변률·후속 질문률 비교 |
| **수강생 참여 저조** — 결과 화면이 빈약 | 높음 | 앱·회원가입 제거, 진입 후 2단계 질문, 첫 수업에 강사 시연·실제 답변. 진입률·작성률·첫 질문 시간·재사용률 측정 |
| **강사·운영사 지불의사 부족** | 높음 | “질문 도구”가 아니라 “반복 질문 감소·강의 개선 증거”를 판매. 유료 파일럿에서 분석시간 절감·자료 수정 건수 측정. 무료 사용 의향은 구매 신호로 불인정 |
| **Classum 등 경쟁 선점·차별화 실패** | 높음 | 기능 수 경쟁 회피. `좌표 맥락·회차 누적·근거 추적·Course Brain`을 차별축으로 고정. 기존 채팅·게시판과 병행 실험해 질문 구체성·맥락 파악 시간·자료 수정 전환율 비교 |
| **좌표 앵커의 실효성 미검증** — 텍스트 위주 슬라이드면 좌표 정보가치 낮음 | 중간 | 핀 강제 안 함(위치 질문 vs 전체 질문 구분). 좌표 질문이 답변시간·오해율을 실제로 줄이는지 측정. 개선 없으면 좌표를 핵심가치→선택 입력으로 강등하고 “자료 근거 질문”으로 재정의 |
| **국비교육 규제·예산 의존** | 중간 | 사교육 B2C 학원·기업 사내교육으로 세그먼트 분산 |
| **참여도구 가격 하방 압력**(Slido 무료·Mentimeter 저가) | 중간 | 개선 리포트·강의 AI로 상위 가격대 정당화 |
| **라이브 동기화·성능**(대형 강의 동시 접속) | 중간 | WebSocket·격자 집계, 컨퍼런스 세그먼트로 성능 쇼케이스 검증 |

---

## 15. 로드맵

| 단계 | 기간 | 범위 | 게이트 |
| --- | --- | --- | --- |
| **Phase 0A — 실행 가능한 베타 기준선** | **완료(2026-08-30 코드 기준)** | 인증, 폴더/자료, 스트리밍 변환, 익명 point PIN 질문, 답변·해결, Realtime, 공감·이모지, 발표, 기본 인사이트, 발표 메모, Course Brain 질문·답변 적재 | 기능 연결 완료. 파일럿 성과 검증과 동일하지 않음 |
| **Phase 0B — 파일럿 준비 완료** | 다음 | 슬라이드 전체 질문, Class CSV, 제출 draft 복구, 관찰 이벤트, 핵심 journey 브라우저 회귀 점검, 로컬 migration clean replay | 진입 60%+·작성 30%+, 기기 간 좌표 동일, “좌표 질문 → 강사 답변 → 자료 수정” 루프 1건 이상 실증 |
| **Phase 1A — 근거 기반 AI 강의자 리포트** | 문서 승인 후 | 폴더/복수 자료 선택, 공간 evidence pack, A/B 리포트, 근거 표시, AI 수정·확정, PDF, 비동기 실행·평가 | 관련 3개 artifact 승인, 근거 연결·평가 gate 통과, 리포트가 실제 자료 수정으로 이어짐 |
| **Phase 1B — 인텔리전스·Course Brain** | 파일럿 통과 후 | 좌표 heatmap, 개념 클러스터·회차 전후 비교, 임베딩 백필, 강의 특화 AI(RAG) 검색·생성 | 유료 파일럿 전환, 근거 없는 답변 기권, AI 웃돈 검증 |
| **Phase 2 — 운영사 스케일** | 2026 겨울~ | 운영사 팀 플랜·코스/강사별 운영 리포트·구독 전환, 컨퍼런스 세그먼트(마케팅·검증) | 첫 유료 계약·2회차 재사용, AI 웃돈 검증 |
| **Phase 3 — 확장** | 2027~ | 기업 사내교육·다중 조직·LMS 연동, 어댑터 추가 | 사교육 외 2개 조직 유료·재계약 1건 |
| **GVCGE 확장 E1~E4** | 증거 확보 시 | E1 다중 임베딩 검색 → E2 hybrid retrieval·RAG 근거 답변 → E3 비전 고도화(자동 개념 제안·개별 스크린샷) → E4 전용 Vector/Graph DB·학습 데이터셋 export | 단계별 승격 조건 |

---

## 16. 오픈 퀘스천 (파일럿에서 확정)

1. **최초 유료 구매 단위** — 강사 개인 vs 코스 vs 운영사 좌석제 중 예산 승인·확장성이 가장 좋은 모델.
2. **라이브 vs 사후 가치의 실제 비중** — 제품 IA는 폴더-first와 자료 live workspace로 결정됐지만, 구매·재사용을 만드는 행동이 라이브 답변인지 사후 인사이트/리포트인지는 파일럿에서 측정.
3. **`resolved`의 결정권자** — 수강생 확인(데이터 품질↑, 참여 부담↑) vs 강사 판정(운영 쉬움, 이해 여부 불명확).
4. **익명성 vs 추적성 균형** — 현재는 anonymous session 고정이다. 이름 선택을 열 경우 질문량, 개인별 후속 지원, 부적절 사용 통제, 심리안전을 함께 검증.
5. **좌표 앵커 필수 질문의 최소 비율** — 핀 질문의 답변시간·구체성·자료 수정 전환율이 일반 질문보다 명확히 높아야 제품 정체성 유지. 미달 시 Course Brain 핵심 입력을 좌표가 아닌 “자료 근거 질문”으로 재정의.
6. **강의 vs 코스 단위** — 장기 데이터 경계는 코스로 결정했다. 현재 업로드는 `Course 1 = Lecture 1 = Material 1`이고 폴더가 여러 자료를 묶는다. 반복 회차를 한 Course 아래 노출하는 시점과 기존 자료의 승격 UX를 결정해야 한다.
7. **질문 상태 단순화** — 현재 enum/UI에는 `answered`와 `resolved`가 함께 남아 있다. 답변 저장과 해결 판정을 하나로 볼지, 수강생 확인을 추가해 둘을 분리할지 결정하고 migration·집계 의미를 일치시켜야 한다.
8. **한국어 짧은 질문 임베딩·클러스터링 파라미터** 최적치 — 첫 파일럿 데이터로 탐색.
9. **강의 특화 AI가 질문을 흡수하되 강사 신호를 남기는 설계** — AI가 답해도 강사에게 “이 질문이 있었다”는 데이터를 남기는 방법.
10. **AI 리포트 과금·실행 경계** — 폴더 전체/복수 자료 리포트의 최소 evidence, 생성 비용, revision 한도, PDF 확정본의 보존 기간을 관련 artifact에서 확정.

**구현으로 닫힌 결정**: 좌표는 `coords jsonb` 하나로 point·box·path 이력을 저장하고 DB CHECK로 검증하되 참여자의 신규 입력은 point PIN만 허용한다. 강사 화면은 desktop-first, 수강생은 mobile-first다. 인사이트와 AI 리포트 진입은 전역 sidebar가 아니라 폴더 상세 탭에 둔다.

---

## 17. 문서 관계와 참고 자료

**계승 관계**: 본 문서는 `Pin 최종 PRD — Visual Feedback Intelligence Platform`(피드백 도메인)의 구조·원칙(좌표 데이터 레이어·데이터가 제품·근거 추적 100%·수치는 코드/서술은 LLM·GVCGE 정합)을 강의 도메인으로 번역·확장한 것이다. 주요 변경: 관리 단위 `Action` → 질문 상태(answered/resolved) + 개선 과제 / 단일 사후 모드 → 라이브+사후 / 구매자 시설관리자 → 사교육·직무교육 운영사 / 신규 추가 개념 클러스터·회차 누적·강의 특화 AI(Course Brain).

**내부 참고**: [[GVCGE]]·[[GVCGE-연구계획서]](GLQO%20Lecture%20Adapter,%20GVCO/UGAO/Region%20Anchor%20정합%20기준) · [[TAGLOW-Class-PRD]](LearningSpace/Session/Question/Answer/CourseBrainMemory%20선행%20설계) · [[타겟전환-리서치]]·[[PinDa-교수학생-인터뷰-요약]]·[[PinDa-피치덱-변천사]](교수→유료교육%20피벗%20근거) · [[Pin-최종-PRD-Visual-Feedback-Intelligence]].

**외부 (model-council 리서치, 주요만)**: 경쟁(Slido·Mentimeter Pin on Image·ClassPoint·Classum·Pigeonhole·Coursera Coach) · 문제 근거(ChatGPT 과제 사용률·질문 장벽·능동학습 메타분석 PNAS/Springer) · ROI(HRD 성과평가·국비 취업률/수료율/재위탁·부트캠프 만족도) · 시장(오디언스 응답 SW). URL은 §2·§3 각주 참조.

**분석 방법**: 이 PRD는 model-council 멀티모델 교차분석(Codex + Claude deep[시장·경쟁] + Claude balanced[데이터 모델])으로 도출한 결론을 통합했다. 핵심 공통 결론 — (1) 좌표 질문+강의 개선+강의 AI 결합은 시장 공백, (2) 코스 단위 스키마가 RAG·회차 분석에 유리, (3) **P0에서 AI를 앞세우지 말고 먼저 “좌표 질문 → 답변 → 강의 수정” 루프를 증명하라.**

**현재 문서 그래프(2026-08-26)**: `docs/document-manifest.json`은 이 PRD를 source로 삼는다. `ai-report-product`는 drafting, `ai-report-evidence`와 `ai-report-system`은 proposed 상태이며 세 artifact 모두 아직 승인되지 않았다. 승인 전에는 AI 리포트 제품 코드·migration·인프라를 구현하지 않는다. 제품 명세의 현재 결정 경계는 `docs/ai-instructor-report-product.md`를 따른다.

---

> **수강생에게 Pin Class는 손 들지 않고도 “여기서 막혔어요”를 남기는 가장 쉬운 방법이다. 강사에게 Pin Class는 어디서 막혔는지 읽지 않고도 보는 시스템이다. 그리고 Pin Class의 자산은 화면이 아니라, 코스 위에 쌓이는 슬라이드-좌표-질문-답변-개선 데이터다.**
>
