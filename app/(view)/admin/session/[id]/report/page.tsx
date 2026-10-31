"use client";

import { useLanguage } from "@/app/_controller/language-context";
import { LoadingScreen } from "@/app/component/loading-screen";
import { SessionEndReport } from "./component/session-end-report";
import { useEndReportPage } from "./controller";

export default function ReportPage() {
  const { session, folder, loading } = useEndReportPage();
  const { t } = useLanguage();
  if (loading) return <LoadingScreen />;
  if (!session) return <main className="admin-page"><h1>{t("session.notFound")}</h1></main>;
  return <SessionEndReport session={session} folder={folder} />;
}
