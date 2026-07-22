export type QuestionCategory = "concept" | "why" | "example" | "error" | "important";
export type QuestionStatus = "unanswered" | "answered" | "resolved";

export interface Slide {
  id: string;
  pageIndex: number;
  title: string;
  eyebrow?: string;
  body?: string;
  imageUrl?: string;
}

export interface Question {
  id: string;
  sessionId: string;
  slideIndex: number;
  x: number | null;
  y: number | null;
  category: QuestionCategory;
  text: string;
  status: QuestionStatus;
  answer?: string;
  createdAt: string;
}

export interface ClassSession {
  id: string;
  courseId?: string;
  materialId?: string;
  materialVersionId?: string;
  code: string;
  title: string;
  fileName: string;
  status: "draft" | "live" | "ended";
  currentSlide: number;
  createdAt: string;
  slides: Slide[];
  questions: Question[];
}
