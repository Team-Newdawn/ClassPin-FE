# ClassPin AI 강사 리포트 실험 요약

2026-09-08 정리 · 2026-09-07 실측 · 로컬 파일럿

## 목표와 잠정 결론

강의자료의 영역과 PIN 질문을 연결해 강사에게 근거 있는 개선안을 제공한다.

**PDF → OCR → 영역 분할 → PIN 좌표 연결 → 문맥 해석 → 강사 리포트**

잠정 추천은 **한국어 PP-OCRv5 + PP-DocLayoutV3 + Qwen3 4B**. 15페이지·17 PIN에 약 **11분 30초**가 걸렸다. 다음 개발의 기준 조합이며 상용화 완료를 의미하지 않는다.

## 1. 두 실험의 차이

| 단계 | 첫 실험: 기존 강사 리포트 | 두 번째 실험: 모델 비교 |
|---|---|---|
| 읽기 | Tesseract OCR | OCR 후보 3종 비교 |
| 영역 | 같은 줄의 단어를 박스로 묶고 페이지당 앞쪽 최대 12줄 사용 | Layout 모델로 표·그림·본문 등 구분 |
| PIN 연결 | 포함 영역 또는 제한 거리 내 가까운 영역 | 영역과 PIN 좌표 매핑 |
| 해석 | 키워드·통계 기반 문구 템플릿 | OCR 영역·페이지 문맥과 질문을 LLM으로 해석 |
| 성격 | UI·규칙 기반 시제품 | 실제 모델 분석, 정확성 추가 검증 필요 |

첫 실험은 첫 줄을 제목, 나머지를 본문으로 지정했다. ‘근거·측정·왜’ 등의 질문에는 미리 작성한 개선안을 출력했다. **‘180개 의미 영역’이나 ‘근거 충분’ 표시는 의미 이해 정확도의 증거가 아니다.** 두 실험을 동일 조건의 성능 대조군으로 보지 않는다.

## 2. 모델 비교 결과

방법은 고정하고 한 번에 모델 하나씩 교체했다. 후보 기준은 상용 라이선스 검토 가능성, 한국어·문서 적합성, 로컬 실행, 경량 대비 품질이다.

| 역할·지표 | 후보별 결과 | 잠정 선택 이유 |
|---|---|---|
| OCR: 문자 오류율 ↓ | Tesseract 35.9% / EasyOCR 2.8% / **PP-OCRv5 0.0%** | 한국어 글자 인식 |
| Layout: 부분 정답 영역 일치 ↑ | **DocLayoutV3 7/8** / DocLayout-S 2/8 / Florence-2 0/8 | 문서 구조 검출 |
| LLM: 임시 질문 의도 일치 ↑ | **Qwen3 4B 16/17** / Qwen3 1.7B 2/17 / Granite 3.3 2B 8/17 | 질문 해석 품질 |

### 전체 처리 시간·가정 비용

아래 조합의 Layout은 모두 PP-DocLayoutV3다.

| OCR + LLM | 시간 | 가정 비용/건 |
|---|---:|---:|
| Tesseract + Qwen3 4B | 8.44분 | 140.7원 |
| EasyOCR + Qwen3 4B | 11.71분 | 195.2원 |
| **PP-OCRv5 + Qwen3 4B** | **11.50분** | **191.7원** |
| Tesseract + Qwen3 1.7B | 4.15분 | 69.2원 |
| Tesseract + Granite 3.3 2B | 5.85분 | 97.5원 |

**조건·한계:** 단일 PDF, 후보별 1회. Core Ultra 5 125H·RAM 16GB급, CPU 4스레드, GPU 미사용, LLM Q4_K_M. OCR은 3페이지의 24문구, 영역은 IoU 0.5 이상인 8개 부분 정답, 의도는 비블라인드 임시 라벨 평가다. **전체 정확도가 아니다.** S·Florence는 영역 분석 완료 후 리포트 단계에서 제외했다. EasyOCR는 색상 입력 오류 수정 후 재실행한 값이다.

비용은 동일 성능 worker 시간당 1,000원 가정이며 실제 청구액이 아니다. PDF 변환·설치·저장·유휴·운영비는 제외했다.

## 3. 남은 문제와 다음 단계

- **세부 PIN 연결:** 같은 그림의 다른 수치를 가리키는 PIN이 같은 영역에 연결될 수 있다. 독립 정답을 만들어 연결 정확도를 평가해야 한다.
- **의미 검증:** LLM 입력은 OCR 텍스트이며 이미지 직접 이해와 다르다. 인용 검사 통과도 해석·개선안의 정확성을 보장하지 않는다.
- **화면 미완료:** 모델별 핵심요약은 공통 검사 안내문이다. 실제 분석 요약으로 교체해야 한다. 원그래프·페이지별 질문 수는 같은 원본 통계이므로 동일한 것이 정상이다.
- **추가 후보:** Grounding DINO(텍스트 조건 기반 대상 탐지), SAM(지정 대상의 윤곽 분리)은 아직 미실험이다. PIN 연결 개선과 추가 자원 사용량을 비교한다.
- **상용화:** 반복·GPU·동시성 평가, 업로드 시 분석 캐시, 신규 PIN 증분 처리, 라이선스·개인정보 검토가 필요하다.

공개 모델도 연산·운영은 무료가 아니다. 실제 가중치·코드·의존성별 라이선스 조건을 확인해야 한다.

## 근거와 게시 범위

AI 리포트 서비스 소스는 후속 커밋으로 게시했다. 아래 로컬 실험 산출물과 원본 PDF·질문 데이터·모델 가중치·실제 환경변수·로컬 DB는 게시하지 않는다. 새 환경에서는 기존 분석 리포트가 자동으로 복원되지 않는다. 운영 서비스 배포는 별도다.

- 로컬 실측: `output/model-benchmark-final-v1/`
- 첫 실험 코드: `fake-provider.mjs`, `mapping.mjs`, `rebuild-local-ai-report.mjs`
- 화면 연결: `experiment-model.ts`
- [Notion 요약](https://app.notion.com/p/3d56cd041f7f8099b0b5f976b74fff17)
- [PP-OCRv5](https://huggingface.co/PaddlePaddle/korean_PP-OCRv5_mobile_rec) · [DocLayoutV3](https://huggingface.co/PaddlePaddle/PP-DocLayoutV3_safetensors) · [Qwen3 4B](https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF)
- [Grounding DINO](https://github.com/IDEA-Research/GroundingDINO) · [SAM](https://github.com/facebookresearch/segment-anything)
