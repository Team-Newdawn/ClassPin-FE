import { Suspense } from "react";
import { InsightWorkspace } from "@/app/component/insight-workspace";
export default function InsightsPage() {
  return <Suspense fallback={<main className="admin-page">인사이트 불러오는 중…</main>}><InsightWorkspace /></Suspense>;
}
