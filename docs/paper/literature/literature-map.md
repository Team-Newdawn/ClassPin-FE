# 선행연구 지도

- 상태: 2026-10-23 1차 조사(웹 검색 약 15회, 체계적 고찰 아님)
- 검증 표기: **[초록 확인]** arXiv 초록 페이지를 직접 열어 확인 / **[서지 확인]** 여러 검색 결과로 존재·서지만 확인, 본문 미독 / **[문서 확인]** 제공자 공식 문서 직접 확인
- 본문을 읽지 않은 항목의 세부 수치는 인용 전에 원문에서 다시 확인한다.

## A. 이미지 위 표시로 위치를 이해시키기 (visual prompting)

- Yang, J., Zhang, H., Li, F., Zou, X., Li, C., & Gao, J. (2023). *Set-of-Mark prompting unleashes extraordinary visual grounding in GPT-4V*. arXiv:2310.11441. [서지 확인]
  - 영역에 번호·마스크를 얹으면 GPT-4V의 grounding이 크게 향상. 예비 실험 C 조건(번호 표시)의 원형.
- Shtedritski, A., Rupprecht, C., & Vedaldi, A. (2023). What does CLIP know about a red circle? Visual prompt engineering for VLMs. *ICCV 2023*, 11953–11963. arXiv:2304.06712. [서지 확인]
  - 빨간 원이 모델 주의를 해당 영역으로 이끈다.

## B. 화면·이미지에서 위치 찾기 (GUI grounding, pointing)

- Cheng, K., Sun, Q., Chu, Y., Xu, F., Li, Y., Zhang, J., & Wu, Z. (2024). *SeeClick: Harnessing GUI grounding for advanced visual GUI agents*. arXiv:2401.10935. [서지 확인]
  - ScreenSpot 벤치마크. 오답 대부분이 정답 근처(세밀한 위치 문제).
- Jahin, M. A., & Parvez, M. R. (2026). *GUI-Primitives: Diagnosing spatial reasoning failures in vision-language GUI grounding*. arXiv:2608.21832 (EMNLP 2026 main 채택 표기). [초록 확인]
  - 19개 VLM, 실패 대부분은 관계 이해가 아니라 후보 위치 찾기. 후보 두 개를 표시하면 선택 정확도 35~57%p 상승. 제공자별 서버 측 이미지 축소 문제 지적.
- Frontera Del Valle, A. F. (2026). *What looks like a capability limit in vision-language models is a readout limit*. arXiv:2609.27408. [초록 확인]
  - 같은 모델도 답 형식(이름 vs 픽셀 좌표)에 따라 정확도가 크게 다름(Qwen3-VL 68.5% vs 20.0%). 유리한 좌표 형식은 모델마다 다름. 우리 H5의 직접 근거.
- Deitke, M., et al. (2024). *Molmo and PixMo: Open weights and open data for state-of-the-art multimodal models*. arXiv:2409.17146. [서지 확인]
  - 좌표를 일반 텍스트로 쓰는 편이 특수 토큰보다 낫다고 보고.

## C. 문서 입력 형식 (텍스트, 이미지, 둘 다)

- Pottanigari, N. R., Kharaghani, S., Vadacchino, S., Posada, A., MacDonald, K., & Zhang, Y. (2026). *Text, pixels, or both? Evaluating input representations for multimodal document QA*. arXiv:2609.22628 (COLM 2026 CBW, EMNLP 2026 DocInsights 워크숍). [초록 확인]
  - 짧은 문서는 이미지가 가장 정확하나 느림. 텍스트·이미지는 서로 다른 문항을 틀림(19~25% 문항에서 한쪽만 정답). 질문만 보는 TF-IDF 라우터가 효과적.
- Huybrechts, G., Ronanki, S., Jayanthi, S. M., FitzGerald, J., & Veeravanallur, S. (2025). *Document Haystack: A long context multimodal image/document understanding vision LLM benchmark*. arXiv:2507.15882. [서지 확인]
  - 긴 문서에서 이미지 입력 성능 하락(구체 수치는 원문 확인 필요).
- Mathew, M., Karatzas, D., & Jawahar, C. V. (2021). DocVQA: A dataset for VQA on document images. *WACV 2021*, 2199–2208. [서지 확인]
- Masry, A., Long, D. X., Tan, J. Q., Joty, S., & Hoque, E. (2022). ChartQA. *Findings of ACL 2022*, 2263–2279. [서지 확인]
- Tanaka, R., Nishida, K., Nishida, K., Hasegawa, T., Saito, I., & Saito, K. (2023). SlideVQA. *AAAI 2023*, 37(11), 13636–13645. [서지 확인]
  - 슬라이드 덱 QA, 요소 영역 정보 제공 → 실제 슬라이드 정답 데이터 후보(라이선스 확인 필요).

## D. 필요한 쪽만 골라 보여주기 (visual RAG)

- Faysse, M., et al. (2025). ColPali: Efficient document retrieval with vision language models. *ICLR 2025*. arXiv:2407.01449. [서지 확인]
- Cho, J., Mahata, D., Irsoy, O., He, Y., & Bansal, M. (2024). *M3DocRAG*. arXiv:2411.04952. [서지 확인]

## E. 도구를 써야 할 때 쓰지 않는 문제

- Ross, H., Mahabaleshwarkar, A. S., & Suhara, Y. (2025). When2Call: When (not) to call tools. *NAACL 2025*, 3391–3409. [서지 확인]
- SMART: Self-aware agent for tool overuse mitigation (2025). arXiv:2502.11435. [서지 확인] — 대형 모델의 도구 미사용(underuse) 관찰 포함.
- *LLM agents already know when to call tools – even without reasoning* (2026). arXiv:2605.09252. [서지 확인] — 내부 표상에는 도구 필요성이 있으나 호출하지 않음.

## F. 교육·HCI

- Glassman, E. L., Kim, J., Monroy-Hernández, A., & Morris, M. R. (2015). Mudslide: A spatially anchored census of student confusion for online lecture videos. *CHI '15*, 1555–1564. [서지 확인] — 가장 가까운 선행연구. 위치 기반 혼란 표시를 사람이 모아 봄.
- Zyto, S., Karger, D., Ackerman, M., & Mahajan, S. (2012). Successful classroom deployment of a social document annotation system. *CHI '12*, 1883–1892. [서지 확인] — Nota Bene.
- AskNow: LLM 기반 대형 강의 실시간 질의응답(ACM, 2026). [서지 확인, 저자 미확인]

## 제공자 공식 문서 [문서 확인, 2026-10-23]

- Claude: PDF는 페이지마다 이미지로 바뀌고 텍스트가 함께 들어감. 래스터 크기는 제어 불가라 좌표를 페이지에 대응시킬 수 없으니 직접 래스터화하라고 권고. 픽셀 좌표 권장, 0~1000 정규화 비권장. Claude 4.7 이후 모델은 긴 변 2,576px·4,784 토큰까지 축소 없음.
- Gemini: 바운딩 박스 관례 `[ymin, xmin, ymax, xmax]` 0~1000. PDF는 페이지 이미지 + 네이티브 텍스트, `media_resolution`으로 토큰 결정(이미지 high 1,120, PDF medium 560 + 텍스트).
- OpenAI: PDF 입력은 텍스트와 페이지 이미지를 함께 전달. 이미지 `detail`(low/high/original/auto), 32px 패치 기반 토큰.

## 연구 공백(이번 검색 범위)

1. 좌표 → 대상(역방향) 대응을 수십~수백 개 동시 처리하는 과제는 찾지 못했다.
2. 좌표 정밀도·좌표계 정합·입력 형태를 분리한 비교는 찾지 못했다(Readout Limit은 답 형식, GUI-Primitives는 설명→좌표).
3. 위치 기반 학생 질문을 AI가 해석해 강사에게 정리하는 연구는 찾지 못했다(Mudslide는 사람 집계).
