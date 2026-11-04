"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useSessions } from "@/app/_controller/session-store";

/** The session this route shows; a direct visit loads it once when the store does not have it. */
export function useEndReportPage() {
  const { id } = useParams<{ id: string }>();
  const { sessions, ready, loadSessionById } = useSessions();
  const [lookupDone, setLookupDone] = useState(false);
  const session = sessions.find((item) => item.id === id);
  useEffect(() => { if (ready && !session && !lookupDone) void loadSessionById(id).catch(console.error).finally(() => setLookupDone(true)); }, [id, ready, session, lookupDone, loadSessionById]);
  return { session, loading: !ready || (!session && !lookupDone) };
}
