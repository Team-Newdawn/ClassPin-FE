# 문서 색인

승인 상태와 문서 간 의존 관계는 `document-manifest.json`이 기준이다. 문서를 옮기거나 추가하면 manifest의 `path`와 이 색인을 함께 고친다.

```
docs/
├── document-manifest.json   승인 상태·의존 관계(source.prd = product/pin_class_prd.md)
├── product/                 제품 요구사항·기능 명세
│   ├── pin_class_prd.md
│   ├── lecture-roles-and-remote.md
│   └── zoom-app-integration.md         연동 시험 기록, 제품 코드 미반영
├── architecture/            프런트엔드 구조·데이터·계정·성능
│   ├── class-frontend-architecture.md
│   ├── account-structure-implementation.md
│   ├── pin_class_data_flow.md
│   ├── pin_class_database_schema.md
│   └── frontend-performance-audit.md
├── insights/                AI 인사이트·강의자 리포트
│   ├── ai-instructor-report-product.md
│   ├── ai-instructor-report-evidence.md
│   ├── ai-instructor-report-system.md
│   ├── insights-ai-foundation.md       현재 구현 기준(10~16절)
│   ├── insights-backend-handoff.md
│   └── insights-rest-snapshot.md
├── design/                  UI 디자인·검증
│   ├── ohpin-figma-ui-redesign.md
│   └── ohpin-ui-verification.md
├── operations/              배포·용량 분석
│   └── infra-capacity-analysis.md      측정 근거와 추정 범위를 구분한 검토 기록
├── retired/                 종료된 /pin 피드백 제품
│   ├── pin-feedback-sunset.md
│   └── pin-feedback-data-retirement.md
├── research/                날짜별 조사 기록(작성 당시 그대로 보존, 안의 절대 경로 링크는 옛 저장소 위치)
│   ├── 2026-08-31/
│   └── 2026-09-01/
└── paper/                   논문 작업(규칙은 AGENTS.md "Paper research work")
```
