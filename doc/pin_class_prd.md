# Pin 강의 서비스 PRD — Lecture Question Intelligence Platform

> 내부 제품명: **Pin Class** (GVCGE의 Lecture Adapter). 참고 문서: `Pin 최종 PRD — Visual Feedback Intelligence Platform`(피드백 도메인, 이 문서의 구조·원칙 계승). 작성: 2026-07-20. model-council(Codex + Claude deep/balanced) 교차분석 기반.
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

단, **범용 티켓/칸반/결재선은 만들지 않는다.** 강사 워크플로는 답변·상태·개선 과제까지만.

### 5.3 사용 모드 — 라이브 + 사후 (단일 모드가 아님)

피드백 PRD는 “수집 종료 후 일괄 분석” 단일 모드였다. 강의는 **라이브(수업 중 질문 확인)와 사후(복습 질문·회차 분석)를 함께** 지원한다. 각 질문은 발생 시점(라이브/사후)과 수업 진행 위치(current_page)를 기록한다. (온보딩·대시보드의 1순위 초점은 파일럿에서 결정 — §16)

### 5.4 공통 코어와 강의 어댑터 (GVCGE)

| 계층 | 공통 코어 (GVCGE, 도메인 불문) | 강의 어댑터 (Pin Class) |
| --- | --- | --- |
| 수집 | QR 무설치 + 기준 이미지(슬라이드) 위 좌표 핀 + 텍스트 | 코스/강의 세션, 슬라이드 자료, 질문 카테고리(이해안됨·개념·예시·오류·중요·복습) |
| 구조화 | 좌표-텍스트 매핑, 위치∩의미 클러스터 | 개념 단위 클러스터, 질문 intent |
| 인텔리전스 | 빈도·히트맵·자동 분류·리포트 | 혼란 핫스팟·미답변·강의 개선 리포트 |
| 운영 | 상태 흐름 엔진 | 질문 상태(답변/해결)·개선 과제 |
| 데이터 | 좌표 스키마 + Edge + 임베딩 | Course Context·Concept Graph·Course Brain(RAG) |

시장이 바뀌어도 좌표·코스 데이터 스키마는 그대로다 — 이것이 확장의 기술적 근거다.

### 5.5 3화면 구조

| 화면 | 역할 | 우선순위 |
| --- | --- | --- |
| 수강생 질문 화면 | QR 접속, 슬라이드 위 핀+질문 제출 (모바일 우선) | P0 |
| 강사 대시보드 | 질문 히트맵·목록·답변·상태·개선 리포트 (제품의 무게중심) | P0 |
| 슬라이드쇼(발표 화면) | 전체화면 발표용, 질문 태그 기본 비노출, current_page 저장 | P1 |

---

## 6. 사용자 경험

### 6.1 수강생 — 슬라이드 위에서 질문

```
QR/링크 접속 → 현재 슬라이드 표시 → 막힌 위치 클릭(임시 핀, 수정 가능)
→ 질문 입력(+카테고리) 또는 "슬라이드 전체 질문" → 제출 → 답변 확인
```

원칙: ① 위치 먼저, 텍스트는 나중 ② 로그인·앱 없음, 익명/이름은 기관 정책 선택 ③ 좌표는 0~1 비율값(기기·화면 무관 동일 지점) ④ **억지 핀 방지** — 위치가 필요 없으면 슬라이드 전체 질문 ⑤ “나도 궁금해요” 공감 = 위치 병합/투표 대체 ⑥ 제출 실패 시 입력 보존.

### 6.2 강사 — 3탭 의사결정 작업 공간

```
강의/코스 작업 공간
├─ Live       지금 무엇에 답할까 — 새 질문·공감 많은 질문·현재 슬라이드 질문
├─ Map        어디서 막혔나 — 슬라이드+핀/히트맵/개념 클러스터 ↔ 질문 목록(양방향)
└─ Improve    무엇을 바꿀까 — 혼란 핫스팟·미답변·반복 질문 → 개선 리포트·개선 과제
```

- **핀↔︎질문 목록 양방향 연결이 핵심 상호작용**: 핀 클릭 → 원문으로, 원문 클릭 → 핀으로.
- 코스 뷰(회차 전체 개념·재질문 추적)와 강의 뷰(이번 세션)를 전환.
- 만들지 않는 것: 칸반 드래그·알림 센터·결재선.

---

## 7. 데이터 모델 — Course 중심, GVCGE(GLQO) 정합

### 7.1 설계 원칙

1. **핵심 단위는 코스.** `Course > Lecture(Session) > Material > Slide > Question > Answer`. 대부분의 자식 테이블에 `course_id`를 비정규화해 **코스 롤업(개념 그래프·Course Brain)과 강의 뷰를 동시에 값싸게** 지원한다.
2. **질문은 GVCGE의 UGAO에 1:1 매핑**된다. pin 좌표는 `region_anchors`(percent 0~1)로 분리하되 MVP는 point만 활성.
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

### 7.3 핵심 스키마 (SQL 요지)

```sql
CREATE TABLE courses (
  id uuid PRIMARY KEY, owner_id uuid NOT NULL, title text NOT NULL,
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
  kind text CHECK (kind IN ('point','box','polygon')),
  coords jsonb NOT NULL,                                -- point{x,y}/box{x,y,w,h}, 0~1
  created_by text CHECK (created_by IN ('user','ai','admin')),
  CONSTRAINT chk_user_point CHECK (created_by <> 'user' OR kind = 'point')
);

CREATE TABLE questions (           -- = UGAO
  id uuid PRIMARY KEY, course_id uuid NOT NULL,         -- 비정규화
  lecture_id uuid NOT NULL REFERENCES lectures(id),
  slide_id uuid REFERENCES slides(id),                  -- NULL = 슬라이드 전체/코스 질문
  region_id uuid REFERENCES region_anchors(id),
  author_id uuid, is_anonymous bool DEFAULT true,
  intent text CHECK (intent IN ('question','opinion','issue','request')),
  raw_text text NOT NULL, normalized_text text, category text,
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
- **좌표 저장 방식(오픈퀘스천)**: 참고 PRD는 point에 전용 `x,y` 컬럼+CHECK를 권고, 본안은 box/polygon 확장 위해 `coords jsonb`를 제시. point 전용 컬럼 분리 vs jsonb 혼용은 파일럿에서 확정(§16).

### 7.4 좌표·라이브·버전 처리

- **라이브 동기화**: `lectures.current_page`를 강사가 갱신, WebSocket 브로드캐스트. 참여자 핀은 현재 표시 슬라이드(=version 고정)에 귀속.
- **버전**: 슬라이드 개정 = 새 `material_version` + 새 `slides`. 기존 핀은 옛 버전에 고정, 신규 핀은 신규 버전에. 버전 간 자동 리앵커링은 Phase 1.
- **히트맵·클러스터**: 같은 슬라이드 내 point를 격자(20×20) 버킷팅해 혼란 핫스팟. 위치(1차)∩의미(2차, 정규화 텍스트 임베딩) 클러스터를 코스 단위로 집계해 개념 그래프 노드로.

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

MVP는 라이브 질문 표시 + 사후 일괄 리포트. 실시간 자동 분석·RAG는 Phase 1.

### 8.3 강의 특화 AI (Course Brain) — Phase 1+

코스에 축적된 자료·질문·강사 답변·클러스터를 근거로만 답하는 코스 특화 에이전트. 용도: 수강생 복습(“지난 3주 반복 질문 정리”, “이 개념 헷갈린 질문 모아줘”), 강사 준비(“이 코스에서 매번 막히는 지점”), 복습자료·FAQ 자동 생성. 원칙: **자료·질문·답변만 근거로, 슬라이드·원문 질문 인용, 근거 없으면 기권.** 범용 AI 튜터와의 차별점은 “이 코스의 맥락(강사 설명·수강생이 실제로 막힌 지점)”을 안다는 것.

---

## 9. 기능 요구사항 — 4계층 × P0/P1/P2

계층: **수집 → 구조화 → 인텔리전스 → 운영/강의개선.**

### 9.1 ① 수집

| 우선순위 | 기능 |
| --- | --- |
| **P0** | QR·링크 무설치 참여(로그인·앱 없음) |
| **P0** | 코스·강의(세션) 생성, 슬라이드(PPT/PDF) 업로드·페이지 렌더·순서 보존 |
| **P0** | 슬라이드 위 위치 클릭 → 임시 핀 → 수정 → 질문 입력(+카테고리), 슬라이드 전체 질문 옵션 |
| **P0** | 익명/이름 선택(기관 정책), 제출 실패 시 입력 보존, 모바일 대응(터치 44px) |
| **P1** | 라이브 current_page 동기화, “나도 궁금해요” 공감 |
| **P2** | 영상 타임코드 질문, 참여자별 스크린샷(E3 이후) |

### 9.2 ② 구조화

| 우선순위 | 기능 |
| --- | --- |
| **P0** | 0~1 정규화 좌표 저장(기기 무관 동일 지점, 인수 기준), 자료 버전 고정 |
| **P0** | 핀 ↔︎ 질문 목록 양방향 연결, 카테고리 필터, 숨김·복원 |
| **P0** | 좌표·질문·상태가 같은 레코드로 연결된 CSV 다운로드 |
| **P1** | 위치∩의미 하이브리드 클러스터(개념 단위), 클러스터 수동 합치기·나누기·라벨 |
| **P1** | 임베딩 영속화, Course Brain chunk 적재(저장만) |
| **P2** | 자료 AI 이해·객체 라벨링·alignment, 회차 간 SIMILAR_TO 연결 |

### 9.3 ③ 인텔리전스

| 우선순위 | 기능 |
| --- | --- |
| **P0** | 기본 통계(슬라이드별 질문 수·카테고리 분포·미답변 수·최근 질문) |
| **P1** | 슬라이드 질문 히트맵·혼란 핫스팟, 개념별 빈도 Top-N |
| **P1** | 강의 개선 리포트(질문 집중 슬라이드·반복 질문·미답변·개선 후보, 근거 100%) |
| **P1** | 회차 전후 비교(같은 위치 질문 감소) |
| **P2** | 강의 특화 AI(RAG) 질의·복습자료 자동 생성, 학습 데이터셋 export |

### 9.4 ④ 운영·강의개선

| 우선순위 | 기능 |
| --- | --- |
| **P0** | 질문 상태(미답변→답변→해결), 강사 답변 작성, 강의 진행/종료 |
| **P1** | 개선 과제(담당·기한 선택), 결과 공개(“반영됐어요”) 회신 |
| **P1** | 코스·강사별 운영 리포트(운영사용) |
| **P2** | LMS export·연동, 다중 조직·권한, 답변 AI 추천(+강사 확정) |

### 9.5 만들지 않는 것 (P0)

수강생 대상 AI 자동답변 · 자동 개념 클러스터링 · 완전 RAG 챗봇 · LMS·출결·결제 연동 · 고급 조직 권한 · 수강생 간 토론·투표·퀴즈 · 영상 타임코드 · 다국어 · 강의 품질 점수·예측 분석. **특히 수강생 AI 자동답변은 질문 축적 가설 검증 전 도입하지 않는다.**

---

## 10. 비기능 요구사항

- **모바일 우선**: iOS Safari·Android Chrome, 터치 44px+, 첫 화면 3초, 제출 API p95 2초.
- **정확성**: 기기 간 좌표 동일성 = 기능 인수 기준·상시 모니터링. 근거 연결률 100% = 릴리스 차단.
- **신뢰성**: 제출 실패 시 입력 보존, 중복 제출 방지, 관리형 DB 백업.
- **개인정보·법무**: 참여자 기본 익명(익명 세션 키), 이름·소속 MVP 미수집 원칙 / 업로드 이미지 EXIF 제거 / **강사 자료 저작권은 course.owner 귀속, reuse_policy로 재사용·데이터셋화 범위 명시** / AI 학습 재사용은 별도 동의(`reuse_consent`) 전 기본 불허 / 삭제 요청 시 원문·임베딩 동시 삭제.
- **관찰성**: 핀 생성·제출·답변·상태 변경·리포트 조회 이벤트 기록(ROI 측정 데이터 소스).
- 한국어 우선, 영문 번역 키 구조만 준비.

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
| **Phase 0 — 베타 MVP** | 지금 | 코스·강의 생성, 슬라이드 업로드, QR, 수강생 핀 질문, 강사 대시보드(히트맵·답변·상태), 기본 통계·CSV, Course Brain chunk 적재(저장만) | 진입 60%+·작성 30%+, 기기 간 좌표 동일, “좌표 질문 → 강사 답변 → 자료 수정” 루프 1건 이상 실증 |
| **Phase 1 — 인텔리전스·강의개선** | 파일럿 통과 후 | 개념 클러스터·혼란 핫스팟·강의 개선 리포트·회차 전후 비교 + 임베딩 백필·강의 특화 AI(RAG) 검색·생성 | 리포트가 강사의 실제 자료 수정으로 이어짐, 유료 파일럿 전환 |
| **Phase 2 — 운영사 스케일** | 2026 겨울~ | 운영사 팀 플랜·코스/강사별 운영 리포트·구독 전환, 컨퍼런스 세그먼트(마케팅·검증) | 첫 유료 계약·2회차 재사용, AI 웃돈 검증 |
| **Phase 3 — 확장** | 2027~ | 기업 사내교육·다중 조직·LMS 연동, 어댑터 추가 | 사교육 외 2개 조직 유료·재계약 1건 |
| **GVCGE 확장 E1~E4** | 증거 확보 시 | E1 다중 임베딩 검색 → E2 hybrid retrieval·RAG 근거 답변 → E3 비전 고도화(자동 개념 제안·개별 스크린샷) → E4 전용 Vector/Graph DB·학습 데이터셋 export | 단계별 승격 조건 |

---

## 16. 오픈 퀘스천 (파일럿에서 확정)

1. **최초 유료 구매 단위** — 강사 개인 vs 코스 vs 운영사 좌석제 중 예산 승인·확장성이 가장 좋은 모델.
2. **라이브 vs 사후 중 초기 핵심 행동** — 둘 다 지원하되 온보딩·대시보드 1순위 초점을 하나로.
3. **`resolved`의 결정권자** — 수강생 확인(데이터 품질↑, 참여 부담↑) vs 강사 판정(운영 쉬움, 이해 여부 불명확).
4. **익명성 vs 추적성 균형** — 익명은 질문량↑, 개인별 후속 지원·부적절 사용 통제 어려움. 기관 정책·수강생 심리안전 함께 검증.
5. **좌표 앵커 필수 질문의 최소 비율** — 핀 질문의 답변시간·구체성·자료 수정 전환율이 일반 질문보다 명확히 높아야 제품 정체성 유지. 미달 시 Course Brain 핵심 입력을 좌표가 아닌 “자료 근거 질문”으로 재정의.
6. **좌표 저장 방식** — point 전용 컬럼(CHECK·쿼리 유리) vs box/polygon 위한 jsonb 혼용.
7. **강의 vs 코스 단위** — (결정됨: 코스 기준) 단일 강의·컨퍼런스를 `Course 1 = Lecture 1`로 흡수하는 UI에서 코스 계층을 언제 노출/숨길지.
8. **한국어 짧은 질문 임베딩·클러스터링 파라미터** 최적치 — 첫 파일럿 데이터로 탐색.
9. **강의 특화 AI가 질문을 흡수하되 강사 신호를 남기는 설계** — AI가 답해도 강사에게 “이 질문이 있었다”는 데이터를 남기는 방법.

---

## 17. 문서 관계와 참고 자료

**계승 관계**: 본 문서는 `Pin 최종 PRD — Visual Feedback Intelligence Platform`(피드백 도메인)의 구조·원칙(좌표 데이터 레이어·데이터가 제품·근거 추적 100%·수치는 코드/서술은 LLM·GVCGE 정합)을 강의 도메인으로 번역·확장한 것이다. 주요 변경: 관리 단위 `Action` → 질문 상태(answered/resolved) + 개선 과제 / 단일 사후 모드 → 라이브+사후 / 구매자 시설관리자 → 사교육·직무교육 운영사 / 신규 추가 개념 클러스터·회차 누적·강의 특화 AI(Course Brain).

**내부 참고**: [[GVCGE]]·[[GVCGE-연구계획서]](GLQO%20Lecture%20Adapter,%20GVCO/UGAO/Region%20Anchor%20정합%20기준) · [[TAGLOW-Class-PRD]](LearningSpace/Session/Question/Answer/CourseBrainMemory%20선행%20설계) · [[타겟전환-리서치]]·[[PinDa-교수학생-인터뷰-요약]]·[[PinDa-피치덱-변천사]](교수→유료교육%20피벗%20근거) · [[Pin-최종-PRD-Visual-Feedback-Intelligence]].

**외부 (model-council 리서치, 주요만)**: 경쟁(Slido·Mentimeter Pin on Image·ClassPoint·Classum·Pigeonhole·Coursera Coach) · 문제 근거(ChatGPT 과제 사용률·질문 장벽·능동학습 메타분석 PNAS/Springer) · ROI(HRD 성과평가·국비 취업률/수료율/재위탁·부트캠프 만족도) · 시장(오디언스 응답 SW). URL은 §2·§3 각주 참조.

**분석 방법**: 이 PRD는 model-council 멀티모델 교차분석(Codex + Claude deep[시장·경쟁] + Claude balanced[데이터 모델])으로 도출한 결론을 통합했다. 핵심 공통 결론 — (1) 좌표 질문+강의 개선+강의 AI 결합은 시장 공백, (2) 코스 단위 스키마가 RAG·회차 분석에 유리, (3) **P0에서 AI를 앞세우지 말고 먼저 “좌표 질문 → 답변 → 강의 수정” 루프를 증명하라.**

---

> **수강생에게 Pin Class는 손 들지 않고도 “여기서 막혔어요”를 남기는 가장 쉬운 방법이다. 강사에게 Pin Class는 어디서 막혔는지 읽지 않고도 보는 시스템이다. 그리고 Pin Class의 자산은 화면이 아니라, 코스 위에 쌓이는 슬라이드-좌표-질문-답변-개선 데이터다.**
>