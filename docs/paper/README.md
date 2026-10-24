# 논문 작업 공간: 슬라이드 위 PIN 질문을 VLM에 전달하는 방식

- 시작: 2026-10-23, `feature-dev-ai`
- 대상 기능: 인사이트 AI 분석과 AI 대화(`view_slides` 도구). 공급자 무관 흐름 `app/_service/insight-ai.ts`, 공급자별 어댑터 `app/_service/insight-providers/` (2026-10-24 전에는 `insight-claude.ts` 하나)
- 현재 단계: 문헌 조사 완료 → **다중 모델 실험 설계 v2(승인 대기)** → OpenAI·Gemini 어댑터 구현 → 실험 실행 → 논문 개요

## 폴더 구조

```
docs/paper/
├── README.md                     이 문서: 색인, 진행 상태, 결정 기록
├── research/
│   ├── research-questions.md     연구 질문(RQ1~3), 기여, 범위, FINER 평가
│   └── critique-and-risks.md     반론 점검(체크포인트 1~3), 윤리·위험 요인
├── literature/
│   └── literature-map.md         선행연구 지도(A~F), 검증 상태, 연구 공백
├── system/
│   ├── pipeline.md               논문 "시스템" 절 초안 재료(제품 설계 문서 링크)
│   └── insight-pipeline.html     분석·대화 파이프라인 그림
├── experiments/
│   ├── README.md                 실험 목록과 상태
│   ├── 2026-10-pilot-claude/     Claude 단독 예비 실험(완료): 스크립트·결과·요약
│   └── multi-provider/
│       └── design.md             Claude·GPT·Gemini 비교 실험 설계(사전 등록용)
└── venues/
    └── target-venues.md          투고처 후보
```

`experiments/**/data/`는 슬라이드 원본과 렌더 이미지라 `.gitignore`로 제외한다. 원본 덱은 저자 소유 자료이므로 공개 전 별도 판단이 필요하다.

## 결정 기록

- 2026-10-23: 연구 질문을 RQ1~RQ3로 확정. 문헌 리뷰 형식은 사용자가 skip(정식 체계적 고찰 아님) 선택.
- 2026-10-23: 예비 실험의 "PDF보다 이미지가 위치를 잘 맞춘다" 해석을 철회. A 조건이 정수 %로 반올림한 좌표를 받았고, Claude PDF 입력은 서버에서 이미지+텍스트로 바뀌므로 입력 형태와 좌표 정밀도가 섞였다(`research/critique-and-risks.md`).
- 2026-10-23: 논문 개요보다 다중 모델 실험을 먼저 한다(`experiments/multi-provider/design.md`).
- 2026-10-24: 제품이 공급자별 어댑터 구조로 바뀌어 실험 설계를 v2로 고쳤다. 실험은 제품 어댑터로 호출하고(PDF 조건만 SDK 직접), 한 호출의 슬라이드 수(E1b)와 제품 결정 규칙을 추가했다. v1의 별도 `providers.ts`·실험용 `package.json`·기본 추론 보조 조건은 폐기(변경 목록: `design.md` 0절).
