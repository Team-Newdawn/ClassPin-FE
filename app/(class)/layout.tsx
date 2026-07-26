import { SessionStore } from "@/components/session-store";

/**
 * 강의 앱 전용 상태. 루트에 두면 피드백 라우트에서도 같이 돌아,
 * /pin/* 을 열 때마다 쓰지도 않는 강의 목록을 한 번씩 더 조회한다.
 * URL 은 그대로다 — 라우트 그룹은 경로에 나타나지 않는다.
 */
export default function ClassLayout({ children }: { children: React.ReactNode }) {
  return <SessionStore>{children}</SessionStore>;
}
