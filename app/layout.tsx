import type { Metadata, Viewport } from "next";
import { AuthProvider } from "@/components/auth-context";
import { SessionStore } from "@/components/session-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pin Class — 질문이 찍힌 곳에서",
  description: "슬라이드 위 질문을 강의의 지식으로 바꾸는 실시간 강의 질문 플랫폼"
};

// viewport-fit=cover 없이는 env(safe-area-inset-*) 이 늘 0 이라, 노치·홈 인디케이터를 피하려고
// 써 둔 여백이 전부 무시된다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><AuthProvider><SessionStore>{children}</SessionStore></AuthProvider></body></html>;
}
