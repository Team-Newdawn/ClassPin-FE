"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSessions } from "@/app/_controller/session-store";
import { useLanguage } from "@/app/_controller/language-context";
import { SessionEndReport } from "@/app/component/session-end-report";
import { LoadingScreen } from "@/app/component/loading-screen";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { sessions, folders, ready, loadSessionById } = useSessions();
  const { t } = useLanguage();
  const [lookupDone, setLookupDone] = useState(false);
  const session = sessions.find((item) => item.id === id);
  useEffect(() => { if (ready && !session && !lookupDone) void loadSessionById(id).catch(console.error).finally(() => setLookupDone(true)); }, [id, ready, session, lookupDone, loadSessionById]);
  if (!ready || (!session && !lookupDone)) return <LoadingScreen />;
  if (!session) return <main className="admin-page"><h1>{t("session.notFound")}</h1></main>;
  return <SessionEndReport session={session} folder={folders.find((item) => item.id === session.folderId) ?? null} />;
}
