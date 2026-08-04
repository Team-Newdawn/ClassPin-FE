import type { Metadata } from "next";
import { CampaignStore } from "@/components/pin/campaign-store";

export const metadata: Metadata = {
  title: "Pin — 문제가 어디 있는지까지",
  description: "행사·포스터·앱 화면 위 좌표에 피드백을 모아 구조화 데이터로 바꾸는 플랫폼"
};

/** 피드백 앱 전용 상태. 강의 앱의 SessionStore 와 섞이지 않는다. */
export default function PinLayout({ children }: { children: React.ReactNode }) {
  return <CampaignStore>{children}</CampaignStore>;
}
