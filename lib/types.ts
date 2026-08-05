export type QuestionCategory = "concept" | "why" | "example" | "error" | "important";
export type QuestionStatus = "unanswered" | "answered" | "resolved";
export type QuestionAnchorKind = "point" | "box" | "path";
export type PresentationQrPosition = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export interface NormalizedPoint {
  x: number;
  y: number;
}

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
  /** 강의자 전용 발표 메모. 청중 세션 조회에는 포함하지 않는다. */
  speakerNote?: string;
}

export interface Question {
  id: string;
  sessionId: string;
  slideIndex: number;
  x: number | null;
  y: number | null;
  anchorKind?: QuestionAnchorKind;
  width?: number | null;
  height?: number | null;
  path?: NormalizedPoint[] | null;
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
  showQuestionPins: boolean;
  presentationQrPosition: PresentationQrPosition;
  createdAt: string;
  slides: Slide[];
  questions: Question[];
}
