import type { ClassSession } from "./types";

const now = Date.now();

export const demoSession: ClassSession = {
  id: "demo-session",
  code: "PIN240",
  title: "AI Product Strategy",
  fileName: "ai-product-strategy.pdf",
  status: "live",
  currentSlide: 2,
  createdAt: new Date(now - 1000 * 60 * 34).toISOString(),
  slides: [
    { id: "s-1", pageIndex: 0, eyebrow: "AI PRODUCT STRATEGY", title: "From feature to durable advantage", body: "A practical framework for building AI products that compound." },
    { id: "s-2", pageIndex: 1, eyebrow: "THE SHIFT", title: "Interfaces are easy. Context is hard.", body: "The product is not the model call — it is the proprietary context loop around it." },
    { id: "s-3", pageIndex: 2, eyebrow: "FLYWHEEL", title: "Every interaction improves the next", body: "User signal → structured context → better outcome → stronger retention" },
    { id: "s-4", pageIndex: 3, eyebrow: "MEASUREMENT", title: "Measure the loop, not the novelty", body: "Track successful outcomes, context reuse, and time-to-value." },
    { id: "s-5", pageIndex: 4, eyebrow: "OPERATING MODEL", title: "Human judgment stays in the loop", body: "Automation proposes. Domain experts approve. The system learns." },
    { id: "s-6", pageIndex: 5, eyebrow: "NEXT STEP", title: "Start with one closed loop", body: "Choose one repeated decision, capture its context, and prove improvement." }
  ],
  questions: [
    { id: "q-1", sessionId: "demo-session", slideIndex: 2, x: 0.42, y: 0.54, category: "why", text: "구조화된 컨텍스트가 일반 로그 데이터와 다른 점은 무엇인가요?", status: "unanswered", createdAt: new Date(now - 1000 * 42).toISOString() },
    { id: "q-2", sessionId: "demo-session", slideIndex: 2, x: 0.72, y: 0.57, category: "example", text: "리텐션으로 이어진 실제 사례를 하나 더 볼 수 있을까요?", status: "unanswered", createdAt: new Date(now - 1000 * 60 * 2).toISOString() },
    { id: "q-3", sessionId: "demo-session", slideIndex: 1, x: 0.5, y: 0.4, category: "concept", text: "여기서 말하는 proprietary context의 범위가 궁금합니다.", status: "answered", answer: "사용자 행동뿐 아니라 도메인 전문가의 판단과 결과 데이터까지 포함합니다.", createdAt: new Date(now - 1000 * 60 * 7).toISOString() },
    { id: "q-4", sessionId: "demo-session", slideIndex: 0, x: null, y: null, category: "important", text: "오늘 프레임워크를 실무에 적용할 때 가장 먼저 할 일은 무엇인가요?", status: "resolved", createdAt: new Date(now - 1000 * 60 * 12).toISOString() }
  ]
};
