# ClassPin AI 기능 제품 설계 초안

작성일: 2026-09-01  
상태: 논의용 초안. 특허성은 고려하지 않고 제품 가치, 데이터 신뢰성, 구현 복잡도와 운영 안전성만 다룬다.

## 1. 먼저 정할 제품 원칙

ClassPin의 AI 기능은 `리포트를 쓰는 AI` 하나가 아니라 다음 세 층으로 구성하는 것이 좋다.

1. **결정론적 분석 층**: 질문 수, 답변 범위, 좌표 분포, 슬라이드·자료별 분모와 같은 사실을 SQL과 코드로 계산한다.
2. **근거 기반 AI 해석 층**: 슬라이드 이미지와 PIN 주변 문맥을 읽고 핵심 개념, 혼란 주제, 모순, 개선 제안을 구조화한다.
3. **표현·배포 층**: 같은 분석 결과를 플랫폼 대시보드, 강사용 리포트, 수강생용 복습 리포트로 다르게 구성한다.

대시보드와 리포트가 각각 AI를 호출하거나 수치를 따로 계산하면 같은 강의에 서로 다른 결론이 생긴다. 하나의 고정된 분석 결과를 여러 화면이 공유해야 한다.

```text
원본 DB·슬라이드 이미지
  → 데이터 품질·권한 검사
  → 슬라이드 OCR·레이아웃·PIN 문맥 생성
  → 코드 통계
  → 슬라이드별 AI 분석
  → 자료·폴더 합성
  → canonical 분석 결과
       ├─ 플랫폼 Insights
       ├─ 강사용 분석·개선 리포트
       └─ 강사 승인 후 수강생용 복습 리포트
```

## 2. 현재 데이터의 AI 준비 상태

2026-09-01 운영 Supabase를 식별정보 없이 집계한 결과다.

| 항목 | 현재 상태 | 의미 |
| --- | --- | --- |
| 자료·슬라이드·질문 | 자료 45, 슬라이드 425, 질문 936 | 분석 원재료는 충분하다. |
| PIN 좌표 | 질문 936건 모두 anchor 연결 | 위치 기반 분석이 가능하다. point 931, path 5다. |
| 슬라이드 크기 | 425장 중 36장만 width/height 존재 | 정확한 crop·OCR 좌표 연결 전에 보정해야 한다. |
| 자료 checksum | 45개 모두 없음 | 같은 이미지 분석 재사용과 변경 감지가 불가능하다. |
| OCR·슬라이드 캡션 | 저장된 항목 없음 | 이미지 내용을 매번 AI가 처음부터 읽어야 한다. |
| Vector embedding | 0건 | 현재 `course_brain_memory`는 검색 인덱스로 작동하지 않는다. |
| 질문 메모리 | 936건 중 1건이 현재 질문 원문과 불일치 | `course_brain_memory`를 원본 근거로 쓰면 안 된다. |
| 공감 | 실제 반응 28건과 캐시 합계 28건, 불일치 0 | 보조 신호로 사용할 수 있다. |
| 답변 | 8건, 모두 participants 공개 | 표본이 매우 작다. |
| 질문 상태 | resolved인데 답변 행이 없는 질문 5건 | 해결 상태와 실제 답변 여부를 분리해야 한다. |
| 강의 시간 | started/ended가 모두 있는 강의 0건 | 강의·슬라이드별 시간 분석은 아직 불가능하다. |
| 슬라이드 Storage | `lecture-slides`가 public bucket | 자료 비배포 정책과 청중용 리포트 전에 보안 경계를 재검토해야 한다. |
| PIN marker | pin 898, idea 15, smile 12, question 11 | 이모지는 분석 핵심보다 약한 보조 신호다. |

## 3. 각 리소스를 어떻게 사용할 것인가

### 3.1 슬라이드 이미지

이미지는 네 가지 목적으로 사용한다.

1. **OCR**: 제목, 본문, 수식 주변 문자, 표·그래프 label을 읽는다.
2. **레이아웃 분석**: 제목, 문단, 이미지, 표, 차트, 수식의 위치를 찾는다.
3. **멀티모달 의미 분석**: OCR로 충분하지 않은 도식, 화살표 관계, 그래프의 변화, 코드 구조를 해석한다.
4. **근거 화면**: AI 결론에서 원본 슬라이드와 관련 영역으로 이동하게 한다.

슬라이드 전체 이미지 하나만 AI에 보내지 않는다. 다음 세 이미지를 목적에 맞게 사용한다.

- 비식별화한 전체 슬라이드
- PIN 위치를 표시한 overlay
- PIN 주변 crop

### 3.2 PIN 좌표

좌표는 단순 heatmap 이상의 가치가 있다.

1. 정규화 좌표를 이미지 pixel 좌표로 변환한다.
2. point는 해당 지점을 포함하거나 가장 가까운 OCR·레이아웃 block에 연결한다.
3. path는 전체 bounding box와 겹치는 block에 연결한다.
4. 질문을 `슬라이드 전체 질문`이 아니라 `이 그림·문장·수식에 대한 질문`으로 바꿔 AI에 전달한다.
5. 같은 슬라이드에서 가까운 PIN과 의미가 유사한 질문을 묶어 국소 혼란 지점을 만든다.

서로 다른 슬라이드의 좌표를 하나의 공간 좌표계로 합치지는 않는다. 슬라이드가 바뀌면 좌표의 의미도 바뀐다.

### 3.3 질문·피드백 본문과 카테고리

현재 `questions`에는 질문과 피드백 역할의 텍스트가 함께 들어갈 수 있다. 사용자 카테고리는 보존하되 AI가 분석 목적에 맞는 별도 intent를 붙인다.

- 자료 내용 질문
- 자료 내용 피드백
- 강의 진행·설명 피드백
- 플랫폼 사용 피드백
- 단순 반응
- 중복·유사 질문
- 부적절·개인정보·검토 필요

정당한 비판을 부적절한 질문으로 제거해서는 안 된다. 공개 가능 여부, 강사용 분석 가능 여부, 수강생 리포트 사용 가능 여부도 각각 따로 판정한다.

### 3.4 답변

답변은 다음처럼 사용한다.

- 실제 답변이 존재하는 질문과 그렇지 않은 질문을 구분한다.
- 질문 생성부터 첫 답변까지 걸린 시간을 계산한다.
- 질문과 답변이 같은 주제를 다루는지 `답변 연결성`을 AI가 판정할 수 있다.
- 수강생 리포트에는 `participants` 또는 `public`이면서 강사가 승인한 답변만 사용한다.
- AI가 답변의 학문적 정답 여부를 단정하지 않고, 슬라이드 근거와 질문에 응답했는지를 먼저 본다.

현재 답변에는 별도 category가 없다. 답변 종류가 제품에 필요하면 원본 열을 바로 추가하기보다 `설명`, `정정`, `추가 자료`, `후속 안내` 같은 AI annotation으로 먼저 검증한다.

### 3.5 공감과 PIN 이모지

- 공감 수는 강사의 대응 우선순위를 정하는 보조값이다.
- 한 질문의 공감 20개를 독립 질문 20개로 계산하지 않는다.
- 이모지는 사용자가 의도를 표현한 약한 신호와 UI filter로만 사용한다.
- 이모지별 이해도, 만족도 또는 학습효과 점수를 만들지 않는다.

## 4. 플랫폼에서 즉시 제공할 결정론적 분석

AI 호출 없이 Insights 탭을 열자마자 보여줄 분석이다.

### 4.1 자료 한 개 범위

| 분석 | 계산 |
| --- | --- |
| 질문 근거 범위 | 질문이 있는 슬라이드 수 / 전체 슬라이드 수 |
| 질문 상태 | 유효 질문의 unanswered·answered·resolved·archived 개수 |
| 실제 답변 범위 | 답변 행이 하나 이상 있는 질문 수 / 유효 질문 수 |
| 응답 시간 | 질문별 첫 답변 시각 - 질문 생성 시각의 중앙값·범위 |
| 질문 유형 | 사용자 category와 AI intent를 각각 집계 |
| 슬라이드 hotspot | 슬라이드별 질문, 미답변, 공감 수 |
| 공간 hotspot | 슬라이드 안의 정규화 격자별 질문 수와 점유 영역 |
| 공간 집중도 | 질문이 특정 block에 몰렸는지, 슬라이드 전체에 흩어졌는지 |
| 데이터 품질 | 좌표 없음, OCR 낮은 신뢰도, 필터 제외·검토 필요 수 |

현재 Insights의 `PIN 비율`은 모든 질문에 anchor가 연결된 현재 구조에서는 거의 정보를 주지 않는다. `질문 근거 범위`와 `실제 답변 범위`로 교체하는 편이 낫다. `해결률`은 상태값이고 답변 존재 여부와 다르므로 두 지표를 분리한다.

### 4.2 폴더·복수 자료 범위

| 분석 | 계산 |
| --- | --- |
| 자료 근거 범위 | 질문이 있는 자료 수 / 선택한 전체 자료 수 |
| 전체 질문·답변 | 자료별 비율을 평균하지 않고 전체 분자·분모를 다시 합산 |
| 자료별 분포 | 질문, 미답변, 질문 있는 슬라이드 비율의 중앙값과 범위 |
| 자료 편중 | 전체 또는 주제별 질문 중 가장 큰 자료가 차지하는 비율 |
| 반복 주제의 폭 | 같은 주제를 지지하는 서로 다른 자료 수 |
| 특정 자료 신호 | 한 자료에서만 발견된 중요한 신호 |
| 자료 간 모순 | 서로 다른 자료의 관련 주장 사이의 모순 |

폴더는 정리 단위일 뿐 같은 학습 주제를 보장하지 않는다. 같은 폴더라는 이유만으로 질문을 합치지 않는다.

### 4.3 시간 기반 분석에 필요한 추가 기록

현재는 강사가 어느 슬라이드를 얼마나 오래 보여줬는지 기록하지 않는다. 다음 기능을 원하면 `lecture_slide_events`가 필요하다.

- 슬라이드 체류 시간
- 슬라이드 노출 후 질문이 나오기까지의 시간
- 분당 질문 밀도
- 설명을 다시 방문한 슬라이드
- 강의 진행 중 질문 급증 구간

강사가 `current_page`를 바꿀 때 서버 RPC가 이전 구간을 닫고 새 event를 여는 방식이면 충분하다. 수강생의 모든 화면 이동을 추적할 필요는 없다.

## 5. AI가 담당할 분석

AI가 숫자를 계산하지 않고 의미를 해석하도록 역할을 제한한다.

### 5.1 슬라이드 내용 분석

- 슬라이드 제목과 핵심 주장
- 주요 개념과 용어
- 표·그래프·도식의 설명
- 앞뒤 슬라이드와의 흐름
- OCR로 읽지 못한 시각 정보
- 강의자료만 보고 작성한 요약과 PIN 근거가 뒷받침하는 반응을 분리

### 5.2 PIN 문맥 분석

- PIN이 가리키는 텍스트·수식·이미지 block
- 질문이 실제로 묻는 개념
- 같은 위치의 질문끼리 지지·모순·무관 판정
- 같은 문장처럼 보여도 다른 맥락인 질문 분리
- 중복 질문과 서로 다른 사용자의 같은 의문 구분
- 질문에 포함된 prompt injection을 데이터로만 취급

### 5.3 강의 개선 분석

개선안은 근거가 있는 범위에서 다음 유형으로 제한한다.

- 용어 정의 추가
- 중간 계산·논리 단계 추가
- 예시 또는 반례 추가
- 표·그래프 label 명확화
- 한 슬라이드의 정보 분리
- 질문이 몰린 영역의 설명 순서 변경
- 미답변 질문에 대한 후속 설명
- 상충되는 질문을 확인할 추가 설명 또는 확인 문제

AI는 강의자료를 자동 수정하지 않는다. 강사가 확인할 `개선 작업 후보`를 만든다.

### 5.4 질문 운영 지원

- 유사 질문 묶기
- 강의 내용, 진행, 플랫폼 피드백으로 routing
- 대표 질문 추천
- 답변되지 않은 질문의 우선순위 근거 제공
- 관련 슬라이드와 기존 강사 답변을 근거로 답변 초안 제시

답변 초안은 자동 게시하지 않고 강사가 검토·수정·승인해야 한다.

## 6. 강사용 AI 리포트

강사용 리포트는 하나의 긴 문서보다 같은 canonical 분석을 목적별 view로 제공하는 편이 낫다.

### 6.1 강의 요약 리포트

- 강의의 핵심 개념과 진행 흐름
- 자료별·슬라이드별 주요 내용
- 수강생 질문으로 확인된 관심 주제
- 강의자료 근거와 수강생 반응 근거를 구분
- 각 문장에서 관련 슬라이드로 이동

### 6.2 강의 분석 리포트

- 질문·답변·공감·자료 근거 범위
- 질문 hotspot과 공간 hotspot
- 반복 질문 주제
- 미답변과 해결 상태
- 자료별 편중과 데이터 한계
- 강사 확인이 필요한 모순

### 6.3 강의 개선 리포트

- 가장 먼저 검토할 슬라이드와 이유
- 특정 문장·수식·도식에 연결된 개선 제안
- 반복되는 개념 혼란과 제안
- 미답변 질문에 대한 후속 조치
- 제안별 원본 PIN·슬라이드 근거

불투명한 단일 `강의 점수`를 만들지 않는다. 영향을 받은 자료 수, 슬라이드 수, 질문 수, 미답변, 공감, 자료 편중, 모순 여부를 각각 보여준다.

### 6.4 데이터 품질·한계 리포트

- 질문이 없는 자료·슬라이드 비율
- 필터 제외·검토 필요 질문
- OCR 낮은 신뢰도
- 실제 답변과 상태값의 차이
- 분석에 포함하지 못한 근거
- 현재 데이터로 말할 수 없는 결론

이 섹션은 AI 결과를 신뢰할 수 있는 범위를 강사가 이해하게 한다.

## 7. 수강생·청중용 복습 리포트

강의자료 파일을 전달하지 않아도 다음 가치를 줄 수 있다.

- 강의 핵심 개념 5~10개
- 개념 간 흐름과 짧은 설명
- 강의 중 많이 나온 질문
- 강사가 확인한 핵심 Q&A
- 자주 혼동된 내용과 올바른 구분
- 복습 체크리스트
- 다음 학습을 위한 질문 또는 연습 항목

수강생용 결과는 강사용 리포트를 그대로 줄이지 않는다.

1. 공개가 허용된 claim과 답변만 선택한다.
2. 질문 작성자, 세션 식별자, 내부 피드백과 비공개 답변을 제외한다.
3. 강의자료 이미지를 기본 포함하지 않는다.
4. 원본 자료를 재구성할 정도의 상세한 문구·도표 복제를 피한다.
5. 강사가 초안을 확인하고 승인한 뒤 게시한다.
6. 게시 범위는 해당 세션 참여자, 만료 링크, 공개 중 하나로 명시한다.
7. 철회 후 새 접근은 막을 수 있지만 이미 다운로드한 파일 회수는 보장하지 않는다.

권장 첫 버전은 `세션 참여자 전용 비공개 링크 + 강사 승인`이다. 공개 링크와 자동 이메일 전송은 이후 단계가 안전하다.

현재는 join code로 들어온 모든 참여자의 세션 소속을 별도 행으로 남기지 않으므로, 질문을 쓰지 않은 참여자를 강의 종료 후에도 식별할 수 없다. `세션 참여자 전용`을 실제 권한으로 만들려면 join 성공 시 최소한의 `lecture_participations(lecture_id, participant_id, joined_at)` 행을 만들고, 종료 후 리포트 조회 RLS가 이 membership을 확인해야 한다. join code를 알고 있다는 사실만으로 종료 후 리포트 접근을 허용하지 않는다.

## 8. 학습효과 리포트의 현실적인 경계

현재 PIN·질문·공감·답변만으로 학습효과를 증명할 수 없다. 질문이 줄었다는 사실은 이해가 늘었다는 뜻일 수도 있지만 참여가 줄었거나 질문을 포기했다는 뜻일 수도 있다.

현재 데이터로 제공 가능한 이름은 다음이다.

- 학습 관련 질문 신호
- 이해 곤란 지점 분석
- 질문 대응·해결 현황
- 강의 상호작용 분석

`학습 변화 리포트`를 만들려면 최소 측정 모듈이 필요하다.

1. 강사가 확인한 학습목표
2. 목표에 연결된 사전·사후 짧은 확인 문항
3. 같은 익명 참여자의 사전·사후 응답을 연결할 session-scoped 가명 식별자
4. 문항 점수와 자신감 응답
5. 응답률과 중도 이탈 수
6. 가능하면 일정 시간이 지난 후의 follow-up 문항

이 데이터가 생기면 코드로 다음을 계산할 수 있다.

- 같은 참여자의 사전·사후 paired 변화
- 문항·학습목표별 정답률 변화
- 평균·중앙값 변화와 신뢰구간
- 효과크기
- 자신감과 실제 수행의 차이
- 응답률·탈락률에 따른 해석 제한

이 경우에도 비교집단이나 적절한 연구설계가 없으면 `강의 때문에 변화했다`는 인과를 증명하지 않는다. 제품 명칭은 `학습효과 증명`보다 `학습 변화`가 정확하다.

## 9. 플랫폼 Insights 화면 제안

기존 폴더 상세의 Insights 탭과 `전체/자료별` chip을 유지한다.

### 기본 화면: AI 호출 없음

1. **Overview**: 질문 근거 범위, 미답변, 실제 답변 범위, 데이터 품질
2. **Hotspots**: 슬라이드 순위와 PIN 공간 overlay
3. **Questions**: 질문 유형, 유사 질문 묶음, 답변 대기열
4. **Materials**: 자료별 분포와 편중

### AI 분석이 준비된 뒤

5. **Topics**: 핵심 개념, 반복 혼란, 모순
6. **Improvements**: 개선 작업 후보와 슬라이드 근거
7. **Reports**: 강사용 문서와 수강생용 초안

대시보드 진입마다 AI를 호출하지 않는다. 마지막 분석 시각과 `새 질문 있음`을 표시하고 강사가 갱신을 선택하거나 정책상 자동 배치가 실행될 때만 새 분석을 만든다.

## 10. 권장 AI 처리 파이프라인

### 10.1 자료 업로드 후 한 번 수행

1. 렌더 이미지의 SHA-256, width, height 기록
2. 로컬 OCR과 layout detection
3. OCR block을 0~1 정규화 좌표로 저장
4. 개인정보 후보 block 탐지와 분석용 사본 가림
5. 멀티모달 AI로 slide caption·핵심 개념 생성
6. strict schema와 checksum 검증 후 slide artifact 저장

같은 checksum과 분석기 버전이면 재사용한다.

### 10.2 리포트·AI 인사이트 생성 시 수행

1. 선택 자료와 질문·답변·공감을 DB transaction으로 snapshot
2. 목적별 질문 적격성·개인정보·routing 판정
3. PIN과 OCR/layout block 연결
4. 코드 metric 생성
5. 슬라이드별 멀티모달 분석을 제한된 동시성으로 병렬 실행
6. 구조화 출력과 근거 참조 코드 검증
7. 검증된 슬라이드 결과로 자료별 합성
8. 검증된 자료 결과로 선택 범위 합성
9. 별도 critic으로 과장·무근거·모순 은폐·개인정보 확인
10. canonical 분석과 표현 revision 저장

질문만 새로 생긴 경우 OCR·layout·기본 slide caption을 다시 만들지 않는다. 질문 snapshot과 PIN 분석부터 다시 실행한다.

## 11. 도구 선택

| 책임 | 권장 도구 | 이유 |
| --- | --- | --- |
| 관계형 집계·snapshot | Supabase Postgres SQL/RPC | 현재 권위 원본과 RLS를 그대로 사용한다. |
| 이미지 checksum·crop·overlay | private worker의 Pillow/OpenCV 또는 Sharp/libvips | 결정론적 이미지 처리가 가능하다. |
| OCR·layout | private Python worker의 PaddleOCR/PP-Structure | 한국어·영어 OCR과 bounding box·layout 정보를 로컬에서 만들 수 있다. |
| 이미지 의미 분석 | provider adapter 뒤의 vision 지원 multimodal model | 표·도식·그래프와 질문 문맥을 함께 해석한다. |
| 구조화 결과 | strict JSON Schema 출력 | 자유 텍스트보다 참조·검증이 쉽다. |
| 통계 | SQL + TypeScript, 학습 변화만 Python scipy/statsmodels | AI가 수치를 추정하지 않게 한다. |
| 비동기 실행 | private Cloud Run worker + Cloud Tasks | 많은 슬라이드를 브라우저 요청과 분리한다. |
| 파일 | Supabase private Storage | 가린 이미지와 확정 리포트를 권한 안에서 보관한다. |
| semantic retrieval | 필요해질 때 Supabase pgvector | 외부 VectorDB 없이 현재 Postgres 안에서 시작한다. |
| 차트 | 현재 UI의 CSS/SVG를 우선 사용 | 복잡한 시각화가 생기기 전 chart dependency를 늘리지 않는다. |

PaddleOCR는 한국어를 포함한 다국어 OCR과 bounding box를 제공하고, PP-Structure 계열은 layout·표·차트 영역을 다룬다. 멀티모달 모델은 이미지 입력과 strict structured output을 지원하는지를 평가해야 한다. 모델 이름을 설계에 고정하지 않고 provider, model, prompt, schema 버전을 결과에 기록한다.

## 12. DB 구조 제안

### 12.1 기존 원본 테이블

다음 원본은 계속 권위 데이터로 유지한다.

```text
session_folders → courses → lectures → materials → material_versions → slides
                                                       └→ region_anchors → questions
                                                                            ├→ answers
                                                                            └→ question_reactions
```

`material_versions`는 현재 업로드 원본을 고정하기 위한 내부 구조로만 사용하며 사용자용 개정판 기능을 만들 필요는 없다.

### 12.2 우선 보완할 기존 데이터

1. 모든 `material_versions.checksum` 채우기
2. 모든 `slides.width_px`, `height_px` 채우기
3. `course_brain_memory`의 질문 update 불일치 처리 또는 AI 원본 경로에서 제외
4. resolved 상태와 실제 답변의 의미를 제품 규칙으로 분리
5. `lecture-slides` public bucket을 private + signed access로 전환할지 검토
6. 강의 시간 분석을 원하면 `lecture_slide_events` 추가

### 12.3 새 derived artifact 테이블

#### `ai_slide_artifacts`

한 슬라이드 이미지를 반복 분석하지 않게 하는 캐시이자 계보 기록이다.

```text
id
owner_id
slide_id
source_checksum
image_width / image_height
ocr_text
ocr_blocks_json
layout_blocks_json
redaction_manifest_json
slide_caption_json
concepts_json
analyzer_version
model_fingerprint
schema_version
processing_status
created_at
```

`unique(slide_id, source_checksum, analyzer_version)`로 같은 분석을 재사용한다. 원본 slide가 삭제되면 artifact 행과 private 파생 자산도 cleanup한다.

#### `ai_question_annotations`

원본 질문을 바꾸지 않고 목적별 판정을 재사용한다.

```text
id
owner_id
question_id
source_updated_at
policy_version
model_fingerprint
intent_type
safety_state
pii_state
duplicate_group_alias
instructor_analysis_eligible
audience_report_eligible
reason_codes_json
human_override_json
created_at
```

질문 원문은 기존 `questions`에서 읽고 annotation에는 필요한 판정만 저장한다.

### 12.4 분석·리포트 테이블

승인 문서에서 설계한 다음 여섯 테이블은 아직 운영 DB에 생성되지 않았다. 구현할 때 공통 분석 엔진에 그대로 사용할 수 있다.

- `ai_reports`: snapshot, deterministic metric, canonical 분석, 현재·확정 revision
- `ai_report_materials`: 선택 자료와 자료별 metric·분석
- `ai_report_slides`: 질문 snapshot, slide 분석, 근거 자산과 검증 결과
- `ai_report_revisions`: 강사용·수강생용 표현 결과와 수정 이력
- `ai_report_jobs`: 비동기 단계, 재시도, idempotency와 lease
- `ai_report_storage_cleanup`: private 파생 파일 삭제 outbox

플랫폼 AI 카드도 `ai_reports.canonical_analysis`를 읽고, 문서만 `ai_report_revisions`를 읽게 하면 대시보드와 리포트의 내용이 일치한다.

### 12.5 수강생 배포 테이블

수강생 리포트를 도입할 때만 `ai_report_publications`를 추가한다.

```text
id
owner_id
report_revision_id
audience_scope           session_participants | expiring_link | public
published_content_json
published_at
expires_at
revoked_at
token_hash
```

내부 canonical 분석을 직접 공개하지 않고, 승인된 공개용 내용의 고정 사본만 저장한다.

세션 참여자 전용 배포를 선택하면 다음 membership도 필요하다.

```text
lecture_participations
  lecture_id
  participant_id          anonymous auth user
  joined_at
  primary key (lecture_id, participant_id)
```

이 행은 출석률이나 체류시간을 추정하기 위한 감시 로그가 아니라 종료 후 접근 권한을 증명하는 최소 기록으로 사용한다. 별도 동의를 받고 참여 분석을 도입하기 전에는 화면 이동이나 장치 정보를 추가하지 않는다.

### 12.6 학습 변화 측정 테이블

학습 변화 기능을 선택할 때 별도 모듈로 추가한다.

- `learning_objectives`
- `assessment_items`
- `assessment_runs` 또는 `assessment_phases`
- `assessment_responses`
- 필요하면 session-scoped `participant_measurement_keys`

질문 상태나 공감 수를 시험 점수처럼 재사용하지 않는다.

## 13. VectorDB와 GraphDB 판단

### VectorDB

**첫 버전에는 필요하지 않다.** 한 자료 또는 폴더의 질문 수는 bounded snapshot으로 읽어 AI가 분석할 수 있고, PostgreSQL 집계가 중심이다.

다음 요구가 생길 때 pgvector를 추가한다.

- 수백·수천 자료에서 과거의 유사 질문 검색
- 폴더 밖에서 반복되는 개념 탐색
- 강사가 자연어로 과거 강의·질문을 검색
- 답변 초안을 위해 관련 슬라이드·기존 답변 top-k 검색

이때 외부 VectorDB 대신 현재 Supabase의 pgvector부터 사용한다. `course_brain_memory.embedding`을 바로 채우기 전에 stale update, source 계보, 개인정보, reuse consent를 먼저 해결해야 한다. 보고서의 권위 원본은 vector 검색 결과가 아니라 고정 snapshot이다.

### GraphDB

**사용하지 않는 것을 권장한다.** 현재 관계는 폴더→자료→슬라이드→PIN의 명확한 계층이고 PostgreSQL FK와 JSONB 참조로 충분하다. 주제·질문의 지지·모순 edge도 한 report 안의 JSON 또는 일반 관계 테이블로 저장할 수 있다.

Neo4j 같은 GraphDB는 여러 코스의 개념·선수지식·질문·학습목표를 장기간 연결하고 임의의 다단계 경로 탐색이 핵심 제품이 될 때 다시 검토한다.

## 14. 개인정보·권한·안전

1. 질문·답변·자료명은 외부 AI에 보내기 전에 이메일, 전화번호, token 형태를 가린다.
2. 이미지도 로컬 OCR로 민감 문자열을 찾아 분석용 사본에서 가린다.
3. 질문과 답변은 신뢰할 수 없는 데이터이며 AI 지시문으로 실행하지 않는다.
4. speaker note는 기본 분석에서 제외하고, 나중에 강사가 명시적으로 허용한 instructor-only 기능으로만 추가한다.
5. 수강생 리포트에는 공개 가능한 claim과 답변만 포함한다.
6. 질문 원문, prompt, model completion을 운영 log에 쓰지 않는다.
7. 모델 provider의 보존·학습·지역 처리 정책을 확인하고 설정을 결과 fingerprint에 기록한다.
8. 원본 슬라이드와 AI용 가림 사본을 별도 Storage 경계로 둔다.

## 15. 품질 평가

출시 전 실제 한국어·영어 혼합 강의 fixture로 다음을 평가한다.

- OCR: 일반 글자, 작은 글자, 수식, 표, 그래프 label
- 좌표 연결: point, path, 가장자리, 빈 영역, 여러 block 경계
- 질문 routing: 내용 질문, 진행 피드백, 플랫폼 피드백, 정당한 비판, 욕설, 개인정보
- 유사성: 같은 위치 다른 의미, 다른 위치 같은 주제, 복사 중복, 여러 사람의 같은 질문
- 리포트: 무근거 문장, 잘못된 수치, 모순 은폐, 질문 없는 자료 과장
- 공개: 비공개 답변, 질문 작성자, speaker note, 원본 이미지 URL 유출
- 비용·성능: 1·10·50·300 슬라이드와 슬라이드당 질문 0·1·10·100

각 AI 문장에는 slide·PIN·metric 참조가 있어야 한다. 정상 결과를 과도하게 차단하는 비율도 함께 측정한다.

## 16. 권장 도입 순서

### 단계 A. 데이터 기반 정리

- checksum·이미지 크기 backfill
- Storage 공개 경계 검토
- `ai_slide_artifacts`와 local OCR pipeline
- 질문 상태와 실제 답변 지표 분리

### 단계 B. 플랫폼 기본 분석 개선

- PIN 비율을 질문 근거 범위로 교체
- 실제 답변 범위와 데이터 품질 추가
- 공간 hotspot overlay
- 자료별 분포·편중 표시
- AI 호출 없이 즉시 제공

### 단계 C. 강사용 AI 분석·리포트

- 질문 annotation
- 슬라이드별 멀티모달 분석
- 핵심 주제·혼란·모순·개선 작업 후보
- 같은 canonical 결과를 Insights와 리포트에서 공유

### 단계 D. 수강생 복습 리포트

- 강사 승인 workflow
- 별도 공개 내용 snapshot
- 세션 참여자 전용 접근부터 시작

### 단계 E. 학습 변화 측정

- 학습목표·사전/사후 확인 문항
- 가명 paired 분석
- 신뢰구간·응답률과 한계 표시

## 17. 지금 추천하는 MVP

첫 AI MVP는 다음 한 흐름이면 충분하다.

1. 강사가 폴더 Insights에서 자료 하나를 선택한다.
2. 시스템이 데이터 품질과 질문 근거 범위를 먼저 보여준다.
3. 슬라이드 이미지와 PIN 문맥으로 `핵심 내용`, `혼란 지점`, `미답변`, `개선 작업 후보`를 만든다.
4. 각 결과에서 해당 슬라이드와 PIN으로 이동할 수 있다.
5. 같은 결과를 강사용 A형 카드와 B형 문서로 보여준다.
6. 수강생용 복습 초안을 만들되 강사 승인 전에는 공개하지 않는다.

처음부터 VectorDB, GraphDB, 전 코스 비교, 학습효과 증명, 실시간 자동 답변을 동시에 만들지 않는다. 이 MVP가 실제로 강사의 준비 시간과 미답변 누락을 줄이는지 먼저 확인한 뒤 확장한다.

## 18. 참고 자료

- 현재 제품 분석 흐름: `docs/ai-instructor-report-product.md`
- 근거·좌표·구조화 출력 규칙: `docs/ai-instructor-report-evidence.md`
- snapshot·worker·리포트 DB 설계: `docs/ai-instructor-report-system.md`
- PaddleOCR 다국어 OCR·bounding box: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version2.x/ppocr/quick_start.en.md
- PaddleOCR PP-StructureV3: https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/pipeline_usage/PP-StructureV3.md
- Supabase vector column: https://supabase.com/docs/guides/ai/vector-columns
- Supabase automatic embedding 예시: https://supabase.com/docs/guides/ai/automatic-embeddings
- 이미지 입력을 지원하는 AI API 예시: https://platform.openai.com/docs/quickstart/make-your-first-api-request
- strict JSON Schema 출력 예시: https://platform.openai.com/docs/api-reference/responses
