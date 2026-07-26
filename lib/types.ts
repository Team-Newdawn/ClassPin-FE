export type QuestionCategory = "concept" | "why" | "example" | "error" | "important";
export type QuestionStatus = "unanswered" | "answered" | "resolved";

/** admin = 구글 로그인 강사, participant = QR 익명 수강생 */
export type UserRole = "admin" | "participant";

export interface Profile {
  id: string;
  role: UserRole;
  email: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface Slide {
  id: string;
  pageIndex: number;
  title: string;
  imageUrl?: string;
  /** lecture-slides 버킷 안의 경로. 변환 단계에서 이미 올라간 이미지를 가리킨다. */
  imagePath?: string;
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
  status: "live" | "ended";
  currentSlide: number;
  createdAt: string;
  slides: Slide[];
  questions: Question[];
}
