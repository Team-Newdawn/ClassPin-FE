function lines(words) {
  const grouped = Map.groupBy(words, (word) => word.key);
  return [...grouped.values()].map((lineWords) => ({
    text: lineWords.map((word) => word.text).join(" ").trim(),
    left: Math.min(...lineWords.map((word) => word.left)),
    top: Math.min(...lineWords.map((word) => word.top)),
    right: Math.max(...lineWords.map((word) => word.left + word.width)),
    bottom: Math.max(...lineWords.map((word) => word.top + word.height)),
  })).filter((line) => line.text);
}

export function fakeSlideAnalysis(slideAlias, words, pageSize) {
  const source = lines(words).slice(0, 12);
  const width = pageSize.width;
  const height = pageSize.height;
  const regions = (source.length ? source : [{ text: "내용 확인 필요", left: 0, top: 0, right: width, bottom: height }]).map((line, index) => ({
    alias: `R${String(index + 1).padStart(3, "0")}`,
    type: index === 0 ? "title" : "paragraph",
    bboxNorm: { x1: line.left / width, y1: line.top / height, x2: Math.min(1, line.right / width), y2: Math.min(1, line.bottom / height) },
    readingOrder: index + 1,
    summary: line.text.slice(0, 500),
    concepts: [],
    importance: index === 0 ? "high" : "medium",
    confidence: .5,
  }));
  return { schemaVersion: "ai-report-slide-analysis.v1", slideAlias, slideSummary: regions.map((region) => region.summary).join(" ").slice(0, 800), keyConcepts: [], regions };
}

export function fakeCritic() {
  return { schemaVersion: "ai-report-critic.v1", pass: true, issueCodes: [] };
}

function compactText(value, maximum = 800) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maximum);
}

function slideTitle(summary, slideNumber) {
  const compact = compactText(summary, 800);
  const key = compact.replace(/\s+/g, "").toLowerCase();
  const patterns = [
    [/이미지기반.*태깅|프라이빗커뮤니케이션/, "SOi 서비스 소개"],
    [/문제배경|사용패턴변화|시장.*세분화/, "문제 배경과 시장 변화"],
    [/painpoint|문제정의.*인간관계|자체설문/, "문제 정의와 사용자 Pain Point"],
    [/기존솔루션.*리텐션|참여동기부족/, "기존 SNS의 참여·리텐션 문제"],
    [/먼저올리|폐쇄형.*이탈|업로드감소/, "폐쇄형 SNS의 콜드스타트 문제"],
    [/해결방안.*핵심솔루션/, "핵심 솔루션"],
    [/전체서비스흐름|프라이빗방생성/, "전체 서비스 흐름"],
    [/서비스확장방향|globalidolfan/, "서비스 확장 방향"],
    [/시장크기|목표시장분석/, "목표 시장 분석"],
    [/경쟁자분석|경쟁사.*차별화/, "경쟁사 분석과 차별화"],
    [/핵심기술|기술현황|deepgram/, "핵심 기술과 검증"],
    [/유저검증|사용자검증|해외사용자/, "사용자 검증 및 반응"],
    [/성장계획|확장전략로드맵/, "성장 계획과 확장 전략"],
    [/팀구성|창업탐색팀/, "창업팀 구성"],
    [/summaryofbusiness|사업.*아이템.*요약/, "사업 아이템 요약"],
  ];
  return patterns.find(([pattern]) => pattern.test(key))?.[1]
    ?? compact.split(/[.!?。]/)[0].slice(0, 54)
    ?? `${slideNumber}페이지`;
}

function categoryName(category) {
  return ({
    why: "근거·이유",
    example: "구체적 예시",
    concept: "개념 설명",
    important: "핵심 강조",
  })[category] ?? "일반";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function fakeCanonical(materials) {
  const slides = materials.flatMap((material) => material.slides.map((slide) => ({
    ...slide,
    materialAlias: material.materialAlias,
    title: slideTitle(slide.summary, slide.slideNumber),
    regions: Array.isArray(slide.regions) ? slide.regions : [],
    pins: Array.isArray(slide.pins) ? slide.pins : [],
  })));
  const fallbackRef = `${slides[0].materialAlias}/${slides[0].slideAlias}/${slides[0].regions[0]?.alias ?? "R001"}`;
  const regionRef = (slide) => `${slide.materialAlias}/${slide.slideAlias}/${slide.regions[0]?.alias ?? "R001"}`;
  const pinRef = (slide, pin) => `${slide.materialAlias}/${slide.slideAlias}/${pin.questionAlias}`;
  const allPins = slides.flatMap((slide) => slide.pins.map((pin) => ({ slide, pin, ref: pinRef(slide, pin) })));
  const unansweredPins = allPins.filter(({ pin }) => pin.status === "unanswered" || !pin.answers?.length);
  const mappedPins = allPins.filter(({ pin }) => pin.mappingStatus === "mapped");
  const pinnedSlides = slides.filter((slide) => slide.pins.length > 0);
  const hotspotSlides = [...pinnedSlides].sort((left, right) => right.pins.length - left.pins.length || left.slideNumber - right.slideNumber);
  const categoryCounts = new Map();
  allPins.forEach(({ pin }) => categoryCounts.set(pin.category, (categoryCounts.get(pin.category) ?? 0) + 1));
  const topCategory = [...categoryCounts.entries()].sort((left, right) => right[1] - left[1])[0];
  const totalRegions = slides.reduce((sum, slide) => sum + slide.regions.length, 0);
  const claimIds = [];
  const makeClaim = (title, body, refs, evidenceLevel) => {
    const evidenceRefs = unique(refs).slice(0, 20);
    const claim = {
      id: `C${String(claimIds.length + 1).padStart(3, "0")}`,
      title: compactText(title, 120),
      body: compactText(body, 900),
      evidenceLevel: evidenceLevel ?? (evidenceRefs.length >= 2 ? "sufficient" : "limited"),
      evidenceRefs: evidenceRefs.length ? evidenceRefs : [fallbackRef],
    };
    claimIds.push(claim.id);
    return claim;
  };

  const executiveSummary = [
    makeClaim(
      "전체 페이지 구조 분석",
      `${slides.length}개 페이지를 ${totalRegions}개의 의미 영역으로 나누어 발표 흐름을 확인했습니다. 자료는 ${slides.slice(0, 5).map((slide) => slide.title).join(" → ")} 순서로 핵심 문제와 해결안을 전개합니다.`,
      slides.slice(0, 5).map(regionRef),
      slides.length > 1 ? "sufficient" : "limited",
    ),
  ];
  if (allPins.length) {
    executiveSummary.push(makeClaim(
      "PIN 질문 분포",
      `PIN ${allPins.length}개가 ${pinnedSlides.length}개 페이지에 배치됐고, 이 중 ${mappedPins.length}개는 페이지의 의미 영역과 위치상 연결됐습니다. 질문이 집중된 페이지는 ${hotspotSlides.slice(0, 5).map((slide) => `${slide.slideNumber}페이지(${slide.pins.length}개)`).join(", ")}입니다.`,
      allPins.slice(0, 20).map(({ ref }) => ref),
    ));
  }
  if (topCategory?.[1] >= 2) {
    const matching = allPins.filter(({ pin }) => pin.category === topCategory[0]);
    executiveSummary.push(makeClaim(
      "반복 질문 유형",
      `가장 많이 나타난 유형은 ${categoryName(topCategory[0])} 질문 ${topCategory[1]}개입니다. 핵심 주장 옆에 판단 기준, 수치의 출처와 도출 과정을 함께 보여주는 보강이 필요합니다.`,
      matching.map(({ ref }) => ref),
    ));
  }
  if (unansweredPins.length) {
    executiveSummary.push(makeClaim(
      "답변 대기 현황",
      `현재 ${unansweredPins.length}개의 PIN 질문이 답변을 기다리고 있습니다. 질문이 많은 페이지부터 발표 메모와 후속 답변을 연결하면 다음 강의에서 같은 혼란을 줄일 수 있습니다.`,
      unansweredPins.slice(0, 20).map(({ ref }) => ref),
    ));
  }

  const confusionPoints = hotspotSlides.filter((slide) => slide.pins.length >= 2).slice(0, 8).map((slide) => {
    const questions = slide.pins.slice(0, 3).map((pin) => `“${compactText(pin.text, 100)}”`).join(", ");
    return makeClaim(
      `${slide.slideNumber}페이지 · ${slide.title}`,
      `이 페이지에 PIN ${slide.pins.length}개가 집중됐습니다. ${questions} 질문이 함께 나타나 핵심 주장과 근거, 개념 사이의 연결을 더 명확히 설명할 필요가 있습니다.`,
      slide.pins.map((pin) => pinRef(slide, pin)),
      "sufficient",
    );
  });

  const unansweredQuestions = unansweredPins.slice(0, 30).map(({ slide, pin, ref }) => makeClaim(
    `${slide.slideNumber}페이지 · ${categoryName(pin.category)} 질문`,
    `“${compactText(pin.text, 420)}” 질문이 아직 답변되지 않았습니다. ${pin.regionAlias ? `${slide.title} 페이지의 ${pin.regionAlias} 의미 영역에 연결된 PIN입니다.` : `${slide.title} 페이지의 좌표에는 기록됐지만 OCR 의미 영역과 직접 겹치지 않아 주변 시각 자료 확인이 필요합니다.`}`,
    [ref],
    "limited",
  ));

  const improvementPriorities = [];
  const evidencePins = allPins.filter(({ pin }) => /근거|표본|측정|판단|이유|왜|도출/.test(pin.text));
  if (evidencePins.length >= 2) improvementPriorities.push(makeClaim(
    "1순위 · 주장과 근거를 같은 화면에 배치",
    `${evidencePins.length}개의 PIN이 이유, 근거, 표본 또는 측정 방식을 묻고 있습니다. 시장 성장률·사용자 조사·기술 선정 결과에는 출처, 표본 수, 조사 시점과 계산 기준을 해당 주장 바로 옆에 표시하세요.`,
    evidencePins.map(({ ref }) => ref),
    "sufficient",
  ));
  const flowPins = allPins.filter(({ pin }) => /어떻게|흐름|구축|해결|예시|프로토타입|참여/.test(pin.text));
  if (flowPins.length >= 2) improvementPriorities.push(makeClaim(
    `${improvementPriorities.length + 1}순위 · 작동 흐름을 실제 사례로 검증`,
    `${flowPins.length}개의 PIN이 서비스가 실제로 어떻게 작동하고 참여 부담을 줄이는지 묻고 있습니다. 한 명이 방을 만들고 첫 게시물을 올린 뒤 다른 사용자가 위치 기반 태깅으로 반응하는 과정을 실제 프로토타입 화면 3~4단계로 보여주세요.`,
    flowPins.map(({ ref }) => ref),
    "sufficient",
  ));
  const conceptPins = allPins.filter(({ pin }) => /무엇|차이|이해|핵심|의미/.test(pin.text));
  if (conceptPins.length >= 2) improvementPriorities.push(makeClaim(
    `${improvementPriorities.length + 1}순위 · 핵심 개념과 타깃을 먼저 정의`,
    `핵심 개념이나 서비스 대상이 무엇인지 묻는 PIN이 ${conceptPins.length}개입니다. ‘깊은 관계’, ‘목적 기반 방’, ‘유료 커뮤니티’ 같은 용어를 한 문장 정의와 구체적인 사용자 예시로 먼저 고정하세요.`,
    conceptPins.map(({ ref }) => ref),
    "sufficient",
  ));
  if (hotspotSlides.length) improvementPriorities.push(makeClaim(
    `${improvementPriorities.length + 1}순위 · 질문 밀집 페이지의 발표 메모 보강`,
    `${hotspotSlides.slice(0, 3).map((slide) => `${slide.slideNumber}페이지`).join(", ")}에 질문이 가장 많이 모였습니다. 각 페이지에 예상 질문, 30초 답변, 추가 근거 링크를 발표 메모로 붙이고 다음 세션 전 우선 검토하세요.`,
    hotspotSlides.slice(0, 3).flatMap((slide) => slide.pins.map((pin) => pinRef(slide, pin))),
  ));
  if (!improvementPriorities.length) improvementPriorities.push(makeClaim(
    "페이지별 학습 목표 명시",
    "각 페이지가 전달해야 할 한 가지 핵심 메시지와 다음 페이지로 이어지는 연결 문장을 발표 메모에 추가하세요.",
    slides.slice(0, 3).map(regionRef),
    slides.length > 1 ? "sufficient" : "limited",
  ));

  const materialDetails = materials.map((material) => ({
    materialAlias: material.materialAlias,
    title: material.title,
    slides: material.slides.map((slide) => ({
      slideAlias: slide.slideAlias,
      slideNumber: slide.slideNumber,
      title: slideTitle(slide.summary, slide.slideNumber),
      summary: compactText(slide.summary, 800),
      regionCount: Array.isArray(slide.regions) ? slide.regions.length : Number(slide.regionCount ?? 0),
      pinCount: Array.isArray(slide.pins) ? slide.pins.length : Number(slide.pinCount ?? 0),
    })),
  }));
  const narrativeParagraphs = [...executiveSummary, ...improvementPriorities].map((claim) => claim.body);
  return {
    schemaVersion: "ai-report-canonical.v1",
    overallEvidenceLevel: allPins.length >= 2 ? (unansweredPins.length === allPins.length ? "limited" : "sufficient") : "insufficient",
    executiveSummary,
    confusionPoints,
    unansweredQuestions,
    improvementPriorities,
    materials: materialDetails,
    claimIds,
    narrative: {
      title: `${compactText(materials[0].title, 110).replace(/\.(pdf|pptx?)$/i, "")} · 강의 개선 리포트`,
      paragraphs: narrativeParagraphs,
    },
  };
}
