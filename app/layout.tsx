import type { Metadata } from "next";
import { SessionStore } from "@/components/session-store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pin Class — 질문이 찍힌 곳에서",
  description: "슬라이드 위 질문을 강의의 지식으로 바꾸는 실시간 강의 질문 플랫폼"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body><SessionStore>{children}</SessionStore></body></html>;
}
